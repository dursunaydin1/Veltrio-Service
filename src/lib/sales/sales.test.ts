import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { getCustomerBalance, reversePayment } from "@/lib/finance/service";
import { createProduct } from "@/lib/products/service";
import type { ProductFields } from "@/lib/products/schema";
import { getProductBalance } from "@/lib/stock/ledger";
import { InsufficientStockError, addStock } from "@/lib/stock/service";
import {
  NegativeStockReasonRequiredError,
  SaleRuleError,
  cancelDraftSale,
  collectSalePayment,
  createSale,
  finalizeSale,
  getSaleBalance,
  getSaleItems,
  updateDraftSale,
  type SaleContext,
  type SaleInput,
} from "./service";

const ctx: SaleContext = {
  businessId: "00000000-0000-0000-0000-000000000001",
  deviceCode: "DEMO-AB23",
  actorId: "u1",
};

let buji: string;
let misina: string;
let ali: string;

const productBase: Omit<ProductFields, "name"> = {
  unit: "ADET",
  is_serial_tracked: false,
  default_sale_price: 100,
  last_purchase_price: 60,
  default_tax_mode: "NONE",
  default_tax_rate: 0,
};

const line = (productId: string, quantity: number, unitPriceKurus: number, over = {}) => ({
  productId,
  quantity,
  unitPriceKurus,
  taxMode: "NONE" as const,
  taxRate: 0,
  ...over,
});

const input = (over: Partial<SaleInput> = {}): SaleInput => ({ lines: [line(buji, 2, 10000)], ...over });
const stock = async (id: string) => (await getProductBalance(id)).available;

beforeEach(async () => {
  for (const t of [
    db.customers, db.products, db.stock_movements, db.sales, db.sale_items, db.payments,
    db.opening_balances, db.counters, db.sync_queue, db.audit_logs,
  ]) {
    await t.clear();
  }
  buji = (await createProduct(ctx, { ...productBase, name: "NGK Buji" })).id;
  misina = (await createProduct(ctx, { ...productBase, name: "Misina", unit: "METRE", last_purchase_price: 30 })).id;
  await addStock(ctx, { productId: buji, quantity: 10 });
  await addStock(ctx, { productId: misina, quantity: 50 });
  ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
  await db.sync_queue.clear();
});

describe("hızlı satış — tek adımda FINAL (§5.3, FR-014)", () => {
  it("müşterisiz peşin satış: SAT-… numarası, stok düşer, maliyet snapshot'ı, ödeme müşterisiz belgeye bağlı", async () => {
    const s = await createSale(ctx, input(), { finalize: true, payment: { amountKurus: 20000, method: "CASH" } });

    expect(s.document_no).toMatch(/^SAT-DEMO-AB23-\d{4}-00001$/);
    expect(s).toMatchObject({ status: "FINAL", total_amount: 200, customer_id: undefined });
    expect(s.finalized_at).toBeTruthy();

    expect(await stock(buji)).toBe(8);
    const move = (await db.stock_movements.toArray()).find((m) => m.movement_type === "SALE_OUT");
    expect(move).toMatchObject({ quantity: -2, unit_cost: 60, source_type: "SALE", source_id: s.id });

    const [item] = await getSaleItems(s.id);
    expect(item).toMatchObject({ description_snapshot: "NGK Buji", unit_cost_snapshot: 60, line_total: 200 });
    expect(item.stock_movement_id).toBe(move?.id);

    const [pay] = await db.payments.toArray();
    expect(pay).toMatchObject({ direction: "IN", amount: 200, source_type: "SALE", source_id: s.id });
    expect(pay.customer_id).toBeUndefined();
    expect(await getSaleBalance(s.id)).toEqual({ total: 20000, paid: 20000, remaining: 0 });
  });

  it("numaralar sırayla artar", async () => {
    const a = await createSale(ctx, input(), { finalize: true, payment: { amountKurus: 20000, method: "CASH" } });
    const b = await createSale(ctx, input(), { finalize: true, payment: { amountKurus: 20000, method: "CASH" } });
    expect(a.document_no.endsWith("00001")).toBe(true);
    expect(b.document_no.endsWith("00002")).toBe(true);
  });

  it("ondalıklı miktar: 2,5 metre misina × 80 ₺ = 200 ₺ (TC-013)", async () => {
    const s = await createSale(ctx, { lines: [line(misina, 2.5, 8000)] }, { finalize: true, payment: { amountKurus: 20000, method: "CASH" } });
    expect(s.total_amount).toBe(200);
    expect(await stock(misina)).toBe(47.5);
  });

  it("KDV dahil / hariç toplamlar belgeye yazılır", async () => {
    const s = await createSale(
      ctx,
      { lines: [line(buji, 1, 12000, { taxMode: "INCLUSIVE", taxRate: 20 }), line(misina, 1, 10000, { taxMode: "EXCLUSIVE", taxRate: 20 })] },
      { finalize: false }
    );
    // 120 (dahil) + 120 (hariç 100 + 20)
    expect(s).toMatchObject({ total_amount: 240, subtotal: 200, tax_total: 40, discount_total: 0 });
  });
});

describe("veresiye ve tahsilat (AC-041, TC-042)", () => {
  it("müşterisiz satışta tahsil edilmeyen tutar varsa engellenir ve hiçbir şey yazılmaz", async () => {
    await expect(createSale(ctx, input(), { finalize: true })).rejects.toThrow(/veresiye satış için müşteri/);
    await expect(
      createSale(ctx, input(), { finalize: true, payment: { amountKurus: 5000, method: "CASH" } })
    ).rejects.toThrow(/veresiye satış için müşteri/);

    expect(await db.sales.count()).toBe(0);
    expect(await stock(buji)).toBe(10);
    expect(await db.payments.count()).toBe(0);
  });

  it("müşterili veresiye: borç bakiyeye yansır; sonradan tahsilat kalanı kapatır, ters kayıt geri açar", async () => {
    const s = await createSale(ctx, input({ customerId: ali }), { finalize: true, payment: { amountKurus: 5000, method: "CASH" } });
    expect(await getSaleBalance(s.id)).toEqual({ total: 20000, paid: 5000, remaining: 15000 });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(15000);

    const pay = await collectSalePayment(ctx, s.id, { amountKurus: 15000, method: "CARD" });
    expect((await getSaleBalance(s.id)).remaining).toBe(0);
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);

    await reversePayment(ctx, pay.id, "Hatalı giriş");
    expect((await getSaleBalance(s.id)).remaining).toBe(15000);
  });

  it("hiç ödeme alınmadan tamamen veresiye; fazla tahsilat kabul edilmez", async () => {
    const s = await createSale(ctx, input({ customerId: ali }), { finalize: true });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(20000);
    expect(await db.payments.count()).toBe(0);

    await expect(
      createSale(ctx, input({ customerId: ali }), { finalize: true, payment: { amountKurus: 20001, method: "CASH" } })
    ).rejects.toThrow(/fazla olamaz/);
    expect((await db.sales.toArray()).filter((x) => x.id !== s.id)).toHaveLength(0);
  });

  it("arşivli müşteriye satış yapılamaz", async () => {
    await db.customers.update(ali, { archived_at: new Date().toISOString() });
    await expect(createSale(ctx, input({ customerId: ali }), { finalize: true })).rejects.toThrow(/Arşivlenmiş/);
  });
});

describe("stok kuralları (ST-002, ST-004, TC-011)", () => {
  it("sıfır / yetersiz stokta satış engellenir, hiçbir şey yazılmaz", async () => {
    const pay = { amountKurus: 110000, method: "CASH" as const };
    await expect(createSale(ctx, { lines: [line(buji, 11, 10000)] }, { finalize: true, payment: pay })).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await stock(buji)).toBe(10);
    expect(await db.sales.count()).toBe(0);
    expect(await db.payments.count()).toBe(0);
  });

  it("aynı ürünün iki satırı toplamla kontrol edilir", async () => {
    const pay = { amountKurus: 120000, method: "CASH" as const };
    await expect(
      createSale(ctx, { lines: [line(buji, 6, 10000), line(buji, 6, 10000)] }, { finalize: true, payment: pay })
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await stock(buji)).toBe(10);
  });

  it("ayar eksi stoğa izin veriyorsa neden istenir; nedenle satış yapılır ve stok eksiye düşer", async () => {
    const lenient: SaleContext = { ...ctx, allowNegativeStock: true };
    const pay = { amountKurus: 120000, method: "CASH" as const };

    await expect(createSale(lenient, { lines: [line(buji, 12, 10000)] }, { finalize: true, payment: pay })).rejects.toBeInstanceOf(
      NegativeStockReasonRequiredError
    );
    expect(await db.sales.count()).toBe(0);

    await createSale(lenient, { lines: [line(buji, 12, 10000)] }, { finalize: true, payment: pay, negativeStockReason: "Mal yolda" });
    expect(await stock(buji)).toBe(-2);
    const move = (await db.stock_movements.toArray()).find((m) => m.movement_type === "SALE_OUT");
    expect(move?.note).toMatch(/Mal yolda/);
  });

  it("seri takipli ürün birim seçilmeden / müşterisiz satılamaz; pasif ürün satılamaz", async () => {
    const machine = (await createProduct(ctx, { ...productBase, name: "Makine", code: "M1", is_serial_tracked: true })).id;
    await expect(createSale(ctx, { lines: [line(machine, 1, 100)] }, { finalize: false })).rejects.toThrow(/müşteri seçin/);
    await expect(createSale(ctx, { customerId: ali, lines: [line(machine, 1, 100)] }, { finalize: false })).rejects.toThrow(/birimi seçin/);
    await db.products.update(misina, { archived_at: new Date().toISOString() });
    await expect(createSale(ctx, { lines: [line(misina, 1, 100)] }, { finalize: false })).rejects.toThrow(/pasif/);
  });
});

describe("indirim", () => {
  it("satır indirimi tutardan düşer; satır tutarını aşan indirim reddedilir", async () => {
    const s = await createSale(ctx, { lines: [line(buji, 2, 10000, { discountKurus: 2500 })] }, { finalize: false });
    expect(s).toMatchObject({ total_amount: 175, discount_total: 25 });
    await expect(createSale(ctx, { lines: [line(buji, 1, 10000, { discountKurus: 10001 })] }, { finalize: false })).rejects.toThrow(/indirim/);
  });

  it("belge indirimi satırlara orantılı dağıtılır ve satır indirimine yazılır; kuruş kaybolmaz", async () => {
    const s = await createSale(
      ctx,
      { lines: [line(buji, 1, 10000), line(misina, 1, 20000)], documentDiscountKurus: 1000 },
      { finalize: false }
    );
    expect(s).toMatchObject({ total_amount: 290, discount_total: 10 });
    const items = await getSaleItems(s.id);
    expect(items.map((i) => i.discount_amount)).toEqual([3.33, 6.67]);
    expect(items.reduce((a, i) => a + i.line_total, 0)).toBeCloseTo(290, 2);
  });

  it("belge indirimi satış tutarını aşamaz; negatif olamaz", async () => {
    await expect(createSale(ctx, input({ documentDiscountKurus: 20001 }), { finalize: false })).rejects.toThrow(/büyük olamaz/);
    await expect(createSale(ctx, input({ documentDiscountKurus: -1 }), { finalize: false })).rejects.toBeInstanceOf(SaleRuleError);
    const full = await createSale(ctx, input({ documentDiscountKurus: 20000 }), { finalize: false });
    expect(full.total_amount).toBe(0);
  });
});

describe("taslak (DRAFT) — ST-006", () => {
  it("taslak stok ve finans üretmez, müşteri bakiyesine girmez; kesinleştirince girer", async () => {
    const d = await createSale(ctx, input({ customerId: ali }), { finalize: false });
    expect(d.status).toBe("DRAFT");
    expect(await stock(buji)).toBe(10);
    expect(await db.stock_movements.count()).toBe(2); // yalnızca baştaki açılış stokları
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);

    const f = await finalizeSale(ctx, d.id, { payment: { amountKurus: 20000, method: "CASH" } });
    expect(f.status).toBe("FINAL");
    expect(await stock(buji)).toBe(8);
  });

  it("taslak düzenlenir; kesinleşmiş satış düzenlenemez / iptal edilemez / tekrar kesinleştirilemez", async () => {
    const d = await createSale(ctx, input(), { finalize: false });
    await updateDraftSale(ctx, d.id, input({ lines: [line(misina, 4, 5000)], notes: "Güncel" }));
    expect((await getSaleItems(d.id)).map((i) => [i.description_snapshot, i.quantity])).toEqual([["Misina", 4]]);
    expect(await db.sales.get(d.id)).toMatchObject({ total_amount: 200, notes: "Güncel" });

    await finalizeSale(ctx, d.id, { payment: { amountKurus: 20000, method: "CASH" } });
    await expect(updateDraftSale(ctx, d.id, input())).rejects.toThrow(/Yalnızca taslak/);
    await expect(cancelDraftSale(ctx, d.id, "x")).rejects.toThrow(/Yalnızca taslak/);
    await expect(finalizeSale(ctx, d.id)).rejects.toThrow(/Yalnızca taslak/);
  });

  it("taslak iptali neden ister, audit yazılır; tahsilat taslakla birlikte alınamaz", async () => {
    const d = await createSale(ctx, input(), { finalize: false });
    await expect(cancelDraftSale(ctx, d.id, " ")).rejects.toBeInstanceOf(SaleRuleError);
    await cancelDraftSale(ctx, d.id, "Vazgeçti");
    expect((await db.sales.get(d.id))?.status).toBe("CANCELLED");
    expect(await db.audit_logs.count()).toBe(1);

    await expect(
      createSale(ctx, input(), { finalize: false, payment: { amountKurus: 100, method: "CASH" } })
    ).rejects.toThrow(/kesinleştirilirken/);
  });

  it("kesinleştirmede maliyet snapshot'ı o günkü son alış fiyatından alınır", async () => {
    const d = await createSale(ctx, input(), { finalize: false });
    expect((await getSaleItems(d.id))[0].unit_cost_snapshot).toBe(60);
    await db.products.update(buji, { last_purchase_price: 75 });
    await finalizeSale(ctx, d.id, { payment: { amountKurus: 20000, method: "CASH" } });
    expect((await getSaleItems(d.id))[0].unit_cost_snapshot).toBe(75);
  });
});

describe("eşitleme", () => {
  it("kuyruk sırası: ürün → stok hareketi → satış → satır → ödeme", async () => {
    await db.sync_queue.clear();
    await createSale(ctx, input({ customerId: ali }), { finalize: true, payment: { amountKurus: 20000, method: "CASH" } });
    const { getPendingItems } = await import("@/lib/sync/queue");
    const order = [...new Set((await getPendingItems()).map((i) => i.table_name))];
    const idx = (t: string) => order.indexOf(t);
    expect(idx("stock_movements")).toBeLessThan(idx("sale_items"));
    expect(idx("sales")).toBeLessThan(idx("sale_items"));
    expect(idx("customers")).toBeLessThan(idx("payments"));
  });
});
