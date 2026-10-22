import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { getCustomerBalance } from "@/lib/finance/service";
import { createMachine } from "@/lib/machines/service";
import { createProduct } from "@/lib/products/service";
import type { ProductFields } from "@/lib/products/schema";
import { getProductBalance } from "@/lib/stock/ledger";
import { InsufficientStockError, addStock } from "@/lib/stock/service";
import {
  addOperation,
  addPart,
  recordApproval,
  removeOperation,
  removePart,
  setPartUsedQuantity,
  updateOperation,
  updatePart,
} from "./quote";
import { ServiceRuleError, changeServiceStatus, openService, type ServiceContext } from "./service";

const base: ServiceContext = {
  businessId: "00000000-0000-0000-0000-000000000001",
  deviceCode: "DEMO-AB23",
  actorId: "u1",
  approvalThreshold: 1000,
};

let ali: string;
let machine: string;

const productFields = (over: Partial<ProductFields> = {}): ProductFields => ({
  name: "NGK Buji",
  unit: "ADET",
  is_serial_tracked: false,
  default_sale_price: 100,
  last_purchase_price: 60,
  default_tax_mode: "NONE",
  default_tax_rate: 0,
  ...over,
});

const op = (priceKurus: number | null, description = "Karbüratör ayarı") => ({
  description,
  unitPriceKurus: priceKurus,
  taxMode: "NONE" as const,
  taxRate: 0,
});

beforeEach(async () => {
  for (const t of [
    db.customers, db.machines, db.services, db.service_status_history, db.service_operations,
    db.service_parts, db.service_approvals, db.payments, db.opening_balances, db.sales,
    db.products, db.stock_movements, db.counters, db.sync_queue, db.audit_logs,
  ]) {
    await t.clear();
  }
  ali = (await createCustomer(base, { name: "Ali", village: "K", no_phone_flag: true })).id;
  machine = (await createMachine(base, { customer_id: ali, type: "Testere", brand: "Stihl", model: "MS", is_temporary: false })).id;
});

const newService = (ctx: ServiceContext = base) =>
  openService(ctx, { customerId: ali, machineId: machine, complaint: "Çalışmıyor" });

const serviceOf = async (id: string) => (await db.services.get(id))!;

describe("işlem satırları ve toplam", () => {
  it("satır toplamı KDV ve indirimle hesaplanır, servis tutarına yansır", async () => {
    const s = await newService();
    await addOperation(base, s.id, {
      description: "Motor bakımı", quantity: 2, unitPriceKurus: 10000, discountKurus: 2000, taxMode: "EXCLUSIVE", taxRate: 20,
    });
    // (2 × 100 − 20) × 1,20 = 216,00
    expect((await db.service_operations.toArray())[0]).toMatchObject({ line_total: 216, status: "PENDING", price_pending: false });
    expect(await serviceOf(s.id)).toMatchObject({ labor_fee: 216, total_amount: 216 });
  });

  it("satır eklenince kuyruğa yazılır; INSERT sonrası silme kuyruğu boşaltır", async () => {
    const s = await newService();
    await db.sync_queue.clear();
    const o = await addOperation(base, s.id, op(5000));
    expect((await db.sync_queue.toArray()).some((q) => q.table_name === "service_operations" && q.operation === "INSERT")).toBe(true);

    await removeOperation(base, o.id);
    expect((await db.sync_queue.toArray()).filter((q) => q.table_name === "service_operations")).toHaveLength(0);
    expect((await serviceOf(s.id)).total_amount).toBe(0);
  });

  it("açıklama zorunlu; fiyatsız kalem 'fiyat bekleniyor' olur ve tamamlamayı engeller (SR-007)", async () => {
    const s = await newService();
    await expect(addOperation(base, s.id, op(100, "  "))).rejects.toBeInstanceOf(ServiceRuleError);

    const o = await addOperation(base, s.id, op(null, "Kaynak işi"));
    expect(o).toMatchObject({ price_pending: true, unit_price: 0, line_total: 0 });

    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await changeServiceStatus(base, s.id, "IN_PROGRESS");
    await expect(changeServiceStatus(base, s.id, "COMPLETED")).rejects.toThrow(/Fiyatı belirlenmemiş/);

    await updateOperation(base, o.id, op(30000, "Kaynak işi"));
    await expect(changeServiceStatus(base, s.id, "COMPLETED")).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("tamamlanmış servise satır eklenemez, yeniden açılınca eklenir", async () => {
    const s = await newService();
    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await changeServiceStatus(base, s.id, "IN_PROGRESS");
    await changeServiceStatus(base, s.id, "COMPLETED");
    await expect(addOperation(base, s.id, op(100))).rejects.toThrow(/yeniden açın/);

    await changeServiceStatus(base, s.id, "IN_PROGRESS", "Ek iş çıktı");
    await expect(addOperation(base, s.id, op(100))).resolves.toBeTruthy();
  });
});

describe("müşteri onayı (SR-004/005/006, AC-004, AC-042)", () => {
  it("eşik üstü teklifte karar verilmeden işe başlanamaz; onaydan sonra başlanır", async () => {
    const s = await newService();
    const a = await addOperation(base, s.id, op(150000));
    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await expect(changeServiceStatus(base, s.id, "IN_PROGRESS")).rejects.toThrow(/Müşteri onayı gerekli/);

    await recordApproval(base, s.id, { decisions: [{ kind: "operation", id: a.id, decision: "APPROVED" }], method: "PHONE" });
    await expect(changeServiceStatus(base, s.id, "IN_PROGRESS")).resolves.toMatchObject({ status: "IN_PROGRESS" });
  });

  it("eşik altı teklif onaysız başlar; eşik 0 ise ücretli her işte onay gerekir", async () => {
    const s = await newService();
    await addOperation(base, s.id, op(50000));
    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await expect(changeServiceStatus(base, s.id, "IN_PROGRESS")).resolves.toBeTruthy();

    const strict = { ...base, approvalThreshold: 0 };
    const s2 = await newService(strict);
    await addOperation(strict, s2.id, op(100));
    await changeServiceStatus(strict, s2.id, "DIAGNOSED");
    await expect(changeServiceStatus(strict, s2.id, "IN_PROGRESS")).rejects.toThrow(/onayı gerekli/);
  });

  it("reddedilen ve ertelenen kalem toplama girmez; onay kaydı eklenir (PARTIAL)", async () => {
    const s = await newService();
    const a = await addOperation(base, s.id, op(100000, "A"));
    const b = await addOperation(base, s.id, op(50000, "B"));
    const c = await addOperation(base, s.id, op(20000, "C"));
    expect((await serviceOf(s.id)).total_amount).toBe(1700);

    const approval = await recordApproval(base, s.id, {
      decisions: [
        { kind: "operation", id: a.id, decision: "APPROVED" },
        { kind: "operation", id: b.id, decision: "REJECTED" },
        { kind: "operation", id: c.id, decision: "DEFERRED" },
      ],
      method: "IN_PERSON",
      explanation: "Dükkânda konuşuldu",
    });

    expect(approval).toMatchObject({ decision: "PARTIAL", approved_amount: 1000, method: "IN_PERSON", actor_id: "u1" });
    expect(await serviceOf(s.id)).toMatchObject({ total_amount: 1000, labor_fee: 1000 });
    expect(await db.service_approvals.count()).toBe(1);
  });

  it("hepsi onaylanırsa kayıt APPROVED olur; karar vermeden onay kaydedilemez", async () => {
    const s = await newService();
    const a = await addOperation(base, s.id, op(100));
    await expect(recordApproval(base, s.id, { decisions: [], method: "OTHER" })).rejects.toBeInstanceOf(ServiceRuleError);
    const r = await recordApproval(base, s.id, { decisions: [{ kind: "operation", id: a.id, decision: "APPROVED" }], method: "OTHER" });
    expect(r.decision).toBe("APPROVED");
  });

  it("teklif artarsa yeni onay gerekir: servis 'Müşteri onayı bekleniyor'a alınır (SR-005)", async () => {
    const s = await newService();
    const a = await addOperation(base, s.id, op(150000));
    await recordApproval(base, s.id, { decisions: [{ kind: "operation", id: a.id, decision: "APPROVED" }], method: "PHONE" });
    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await changeServiceStatus(base, s.id, "IN_PROGRESS");

    const extra = await addOperation(base, s.id, op(40000, "Ek iş"));
    expect((await serviceOf(s.id)).status).toBe("WAITING_CUSTOMER_APPROVAL");
    const last = (await db.service_status_history.where("service_id").equals(s.id).toArray())
      .sort((x, y) => y.changed_at.localeCompare(x.changed_at))[0];
    expect(last.note).toMatch(/yeni müşteri onayı/);

    await expect(changeServiceStatus(base, s.id, "IN_PROGRESS")).rejects.toThrow(/onayı gerekli/);
    await recordApproval(base, s.id, { decisions: [{ kind: "operation", id: extra.id, decision: "APPROVED" }], method: "PHONE" });
    await expect(changeServiceStatus(base, s.id, "IN_PROGRESS")).resolves.toBeTruthy();
  });

  it("onaylı kalemin fiyatı artarsa yeniden onay bekler, düşerse onaylı kalır (tolerans 0)", async () => {
    const s = await newService();
    const a = await addOperation(base, s.id, op(100000));
    await recordApproval(base, s.id, { decisions: [{ kind: "operation", id: a.id, decision: "APPROVED" }], method: "PHONE" });

    expect((await updateOperation(base, a.id, op(80000))).status).toBe("APPROVED");
    expect((await updateOperation(base, a.id, op(90000))).status).toBe("PENDING");
  });

  it("onay geçmişi değiştirilemez tabloya yazılır ve kuyruğa INSERT olarak gider", async () => {
    const s = await newService();
    const a = await addOperation(base, s.id, op(100));
    await db.sync_queue.clear();
    await recordApproval(base, s.id, { decisions: [{ kind: "operation", id: a.id, decision: "APPROVED" }], method: "PHONE" });
    const approvals = (await db.sync_queue.toArray()).filter((q) => q.table_name === "service_approvals");
    expect(approvals).toHaveLength(1);
    expect(approvals[0].operation).toBe("INSERT");
  });
});

describe("parça satırları ve stok (SR-008, TC-006, AC-050)", () => {
  let productId: string;

  beforeEach(async () => {
    productId = (await createProduct(base, productFields())).id;
    await addStock(base, { productId, quantity: 5 });
  });

  const stock = async () => (await getProductBalance(productId)).available;

  it("teklif aşamasında stok değişmez; ürün adı, fiyat ve maliyet snapshot'ı alınır", async () => {
    const s = await newService();
    const p = await addPart(base, s.id, { sourceType: "STOCK_PRODUCT", productId, quantity: 2 });

    expect(p).toMatchObject({
      description_snapshot: "NGK Buji", unit_price_snapshot: 100, unit_cost_snapshot: 60,
      line_total: 200, used_quantity: 0, supply_status: "IN_STOCK", status: "PENDING",
    });
    expect(await stock()).toBe(5);
    expect((await serviceOf(s.id)).total_amount).toBe(200);
  });

  it("stokta yetersiz parça 'sipariş edilecek' olarak işaretlenir", async () => {
    const s = await newService();
    const p = await addPart(base, s.id, { sourceType: "STOCK_PRODUCT", productId, quantity: 9 });
    expect(p.supply_status).toBe("TO_ORDER");
  });

  it("kullanıldı denince stoktan düşer (SERVICE_USE + maliyet), geri alınca ters hareket yazılır", async () => {
    const s = await newService();
    const p = await addPart(base, s.id, { sourceType: "STOCK_PRODUCT", productId, quantity: 3 });
    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await changeServiceStatus(base, s.id, "IN_PROGRESS");

    const used = await setPartUsedQuantity(base, p.id, 2);
    expect(used.used_quantity).toBe(2);
    expect(await stock()).toBe(3);
    const useMove = (await db.stock_movements.toArray()).find((m) => m.movement_type === "SERVICE_USE");
    expect(useMove).toMatchObject({ quantity: -2, unit_cost: 60, source_type: "SERVICE_PART", source_id: p.id });

    await expect(setPartUsedQuantity(base, p.id, 1)).rejects.toThrow(/neden zorunlu/);
    await setPartUsedQuantity(base, p.id, 1, "Yanlış parça girilmiş");
    expect(await stock()).toBe(4);
    expect((await db.stock_movements.toArray()).some((m) => m.movement_type === "CANCEL_REVERSAL" && m.quantity === 1)).toBe(true);
  });

  it("yetersiz stokta kullanım engellenir ve hiçbir şey yazılmaz", async () => {
    const s = await newService();
    const p = await addPart(base, s.id, { sourceType: "STOCK_PRODUCT", productId, quantity: 9 });
    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await changeServiceStatus(base, s.id, "IN_PROGRESS");

    await expect(setPartUsedQuantity(base, p.id, 9)).rejects.toBeInstanceOf(InsufficientStockError);
    expect((await db.service_parts.get(p.id))?.used_quantity).toBe(0);
    expect(await stock()).toBe(5);
  });

  it("yalnızca 'İşlemde' serviste kullanılır; teklif miktarını aşamaz", async () => {
    const s = await newService();
    const p = await addPart(base, s.id, { sourceType: "STOCK_PRODUCT", productId, quantity: 2 });
    await expect(setPartUsedQuantity(base, p.id, 1)).rejects.toThrow(/İşlemde/);
    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await changeServiceStatus(base, s.id, "IN_PROGRESS");
    await expect(setPartUsedQuantity(base, p.id, 3)).rejects.toBeInstanceOf(ServiceRuleError);
  });

  it("onay gereken serviste onaylanmamış parça kullanılamaz; reddedilen hiç kullanılamaz", async () => {
    const s = await newService();
    const big = await addOperation(base, s.id, op(150000));
    const p = await addPart(base, s.id, { sourceType: "STOCK_PRODUCT", productId, quantity: 1 });
    await recordApproval(base, s.id, { decisions: [{ kind: "operation", id: big.id, decision: "APPROVED" }], method: "PHONE" });
    // parça hâlâ PENDING ve teklif eşiği aşıyor → bekleyen kalem var, işe başlanamaz
    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await expect(changeServiceStatus(base, s.id, "IN_PROGRESS")).rejects.toThrow(/onayı gerekli/);

    await recordApproval(base, s.id, { decisions: [{ kind: "part", id: p.id, decision: "REJECTED" }], method: "PHONE" });
    await changeServiceStatus(base, s.id, "IN_PROGRESS");
    await expect(setPartUsedQuantity(base, p.id, 1)).rejects.toThrow(/reddettiği/);
  });

  it("kullanılmış parça reddedilemez ve kaldırılamaz", async () => {
    const s = await newService();
    const p = await addPart(base, s.id, { sourceType: "STOCK_PRODUCT", productId, quantity: 1 });
    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await changeServiceStatus(base, s.id, "IN_PROGRESS");
    await setPartUsedQuantity(base, p.id, 1);

    await expect(recordApproval(base, s.id, { decisions: [{ kind: "part", id: p.id, decision: "REJECTED" }], method: "PHONE" })).rejects.toThrow(/kullanılmış/);
    await expect(removePart(base, p.id)).rejects.toThrow(/Kullanılmış parça/);
    await expect(updatePart(base, p.id, { quantity: 0.5 })).rejects.toThrow(/altına/);
  });

  it("müşterinin getirdiği parça ücretsiz ve stoksuzdur; stok dışı alımda fiyat zorunludur", async () => {
    const s = await newService();
    const own = await addPart(base, s.id, { sourceType: "CUSTOMER_SUPPLIED", description: "Müşterinin bujisi", quantity: 1 });
    expect(own).toMatchObject({ line_total: 0, product_id: undefined });

    await expect(addPart(base, s.id, { sourceType: "NON_STOCK_PURCHASE", description: "Dışarıdan conta", quantity: 1 })).rejects.toThrow(/fiyatı zorunlu/);
    const outside = await addPart(base, s.id, { sourceType: "NON_STOCK_PURCHASE", description: "Dışarıdan conta", quantity: 1, unitPriceKurus: 4500 });
    expect(outside.line_total).toBe(45);

    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await changeServiceStatus(base, s.id, "IN_PROGRESS");
    await setPartUsedQuantity(base, own.id, 1);
    expect(await db.stock_movements.count()).toBe(1); // yalnızca baştaki açılış stoğu
  });

  it("seri takipli (makine) ürün servis parçası olamaz; pasif ürün eklenemez", async () => {
    const machineProduct = await createProduct(base, productFields({ name: "Makine", code: "M1", is_serial_tracked: true }));
    const s = await newService();
    await expect(addPart(base, s.id, { sourceType: "STOCK_PRODUCT", productId: machineProduct.id, quantity: 1 })).rejects.toThrow(/Seri takipli/);

    await db.products.update(productId, { archived_at: new Date().toISOString() });
    await expect(addPart(base, s.id, { sourceType: "STOCK_PRODUCT", productId, quantity: 1 })).rejects.toThrow(/Pasif/);
  });

  it("parça satırı kuyruğa sürümle yazılır, stok alanı gönderilmez", async () => {
    const s = await newService();
    const p = await addPart(base, s.id, { sourceType: "STOCK_PRODUCT", productId, quantity: 1 });
    await db.sync_queue.clear();
    await db.service_parts.put({ ...p, version: 3 });

    await updatePart(base, p.id, { quantity: 2 });
    const q = (await db.sync_queue.toArray()).find((x) => x.table_name === "service_parts");
    expect(q).toMatchObject({ operation: "UPDATE" });
    expect(q?.payload).toMatchObject({ version: 3, quantity: 2, line_total: 200 });
  });
});

describe("müşteri bakiyesi ile birlikte", () => {
  it("tamamlanan servisin tutarı bakiyeye girer; reddedilen kalem girmez; kapora düşer", async () => {
    const s = await openService(base, {
      customerId: ali, machineId: machine, complaint: "x", deposit: { amountKurus: 20000, method: "CASH" },
    });
    const a = await addOperation(base, s.id, op(100000));
    const b = await addOperation(base, s.id, op(50000, "Reddedilecek"));
    await recordApproval(base, s.id, {
      decisions: [
        { kind: "operation", id: a.id, decision: "APPROVED" },
        { kind: "operation", id: b.id, decision: "REJECTED" },
      ],
      method: "IN_PERSON",
    });
    await changeServiceStatus(base, s.id, "DIAGNOSED");
    await changeServiceStatus(base, s.id, "IN_PROGRESS");
    await changeServiceStatus(base, s.id, "COMPLETED");

    // 1.000 ₺ servis − 200 ₺ kapora
    expect((await getCustomerBalance(base.businessId, ali)).balance).toBe(80000);
  });
});
