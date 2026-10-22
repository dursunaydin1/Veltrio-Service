import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { createMachine } from "@/lib/machines/service";
import { createProduct } from "@/lib/products/service";
import { createPurchase, receivePurchase } from "@/lib/purchases/service";
import { createSale, finalizeSale, getSaleItems, type SaleContext } from "@/lib/sales/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { StockRuleError, addStock } from "@/lib/stock/service";
import { createSupplier } from "@/lib/suppliers/service";
import { SerialUnitError, addOpeningSerialUnit, getInStockUnits, getSerialUnits } from "./service";

const ctx: SaleContext = {
  businessId: "00000000-0000-0000-0000-000000000001",
  deviceCode: "DEMO-AB23",
  actorId: "u1",
};

let testere: string; // seri takipli
let buji: string; // seri takipsiz
let supplier: string;
let ali: string;
let veli: string;

const stock = async (id: string) => (await getProductBalance(id)).available;
const unitsOf = async (id: string) => (await getSerialUnits(id)).sort((a, b) => a.created_at.localeCompare(b.created_at));

beforeEach(async () => {
  for (const t of [
    db.customers, db.machines, db.machine_ownership_history, db.products, db.product_serial_units,
    db.stock_movements, db.suppliers, db.purchases, db.purchase_items, db.sales, db.sale_items,
    db.payments, db.counters, db.sync_queue, db.audit_logs,
  ]) {
    await t.clear();
  }
  const base = { unit: "ADET", default_sale_price: 5000, default_tax_mode: "NONE" as const, default_tax_rate: 0 };
  testere = (
    await createProduct(ctx, { ...base, name: "MS 180", brand: "Stihl", model: "MS 180", category: "Zincirli testere", is_serial_tracked: true })
  ).id;
  buji = (await createProduct(ctx, { ...base, name: "Buji", is_serial_tracked: false })).id;
  supplier = (await createSupplier(ctx, { name: "Orman Makine" })).id;
  ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
  veli = (await createCustomer(ctx, { name: "Veli", village: "K", no_phone_flag: true })).id;
  await db.sync_queue.clear();
});

const buy = (serialNumbers: string[], quantity = serialNumbers.length, unitPriceKurus = 400000) =>
  createPurchase(
    ctx,
    { supplierId: supplier, lines: [{ productId: testere, quantity, unitPriceKurus, taxMode: "NONE", taxRate: 0, serialNumbers }] },
    { receive: true }
  );

const sellLine = (unitId: string, price = 600000) => ({
  productId: testere,
  quantity: 1,
  unitPriceKurus: price,
  taxMode: "NONE" as const,
  taxRate: 0,
  serialUnitId: unitId,
});

describe("açılış stoğu birimi (ST-012)", () => {
  it("SB-… iç numarası, 'stokta' durumu ve +1 stok hareketi", async () => {
    const u = await addOpeningSerialUnit(ctx, { productId: testere, serialNumber: "SN-100", unitCost: 3500 });
    expect(u).toMatchObject({ serial_number: "SN-100", status: "IN_STOCK" });
    expect(u.internal_number).toMatch(/^SB-DEMO-AB23-00001$/);
    expect(await stock(testere)).toBe(1);

    const move = (await db.stock_movements.toArray())[0];
    expect(move).toMatchObject({ serial_unit_id: u.id, quantity: 1, movement_type: "OPENING", unit_cost: 3500 });
  });

  it("seri numarası olmayan birim yalnızca iç numarayla tanınır; aynı seri numarası (harf farkı olsa da) reddedilir", async () => {
    const a = await addOpeningSerialUnit(ctx, { productId: testere });
    const b = await addOpeningSerialUnit(ctx, { productId: testere });
    expect(a.serial_number).toBeUndefined();
    expect(a.internal_number).not.toBe(b.internal_number);

    await addOpeningSerialUnit(ctx, { productId: testere, serialNumber: "Abc-1" });
    await expect(addOpeningSerialUnit(ctx, { productId: testere, serialNumber: "ABC-1" })).rejects.toBeInstanceOf(SerialUnitError);
    expect(await stock(testere)).toBe(3);
  });

  it("seri takipsiz ürüne birim eklenemez; elle stok hareketi hâlâ yapılamaz", async () => {
    await expect(addOpeningSerialUnit(ctx, { productId: buji })).rejects.toBeInstanceOf(SerialUnitError);
    await expect(addStock(ctx, { productId: testere, quantity: 1 })).rejects.toBeInstanceOf(StockRuleError);
  });
});

describe("seri takipli alım", () => {
  it("her adet ayrı birim olur: girilen seri numaraları + girilmeyen iç numarayla; stok ve maliyet", async () => {
    await buy(["A1", "", "A3"]);

    const units = await unitsOf(testere);
    expect(units).toHaveLength(3);
    expect(units.map((u) => u.serial_number ?? null).sort()).toEqual(["A1", "A3", null]);
    expect(units.every((u) => u.status === "IN_STOCK" && !!u.internal_number && !!u.purchase_item_id)).toBe(true);
    expect(await stock(testere)).toBe(3);

    const intake = (await db.stock_movements.toArray()).filter((m) => m.movement_type === "PURCHASE_IN");
    expect(intake).toHaveLength(3);
    expect(intake.every((m) => m.unit_cost === 4000 && m.quantity === 1 && !!m.serial_unit_id)).toBe(true);
    expect((await db.products.get(testere))?.last_purchase_price).toBe(4000);
  });

  it("taslak birim oluşturmaz; teslim alınca oluşturur", async () => {
    const d = await createPurchase(
      ctx,
      { supplierId: supplier, lines: [{ productId: testere, quantity: 2, unitPriceKurus: 100, taxMode: "NONE", taxRate: 0, serialNumbers: ["X1", "X2"] }] },
      { receive: false }
    );
    expect(await db.product_serial_units.count()).toBe(0);
    await receivePurchase(ctx, d.id);
    expect(await db.product_serial_units.count()).toBe(2);
  });

  it("kurallar: tam sayı adet, fazla seri numarası ve tekrar eden seri numarası reddedilir; hiçbir şey yazılmaz", async () => {
    await expect(buy([], 1.5)).rejects.toThrow(/tam sayı/);
    await expect(buy(["A", "B", "C"], 2)).rejects.toThrow(/en fazla 2 seri/);
    await expect(buy(["A", "a"], 2)).rejects.toThrow(/aynı seri numarası/);
    expect(await db.product_serial_units.count()).toBe(0);
    expect(await db.purchases.count()).toBe(0);
  });

  it("stoktaki bir seri numarası ikinci kez alınamaz; işlem tamamen geri alınır", async () => {
    await buy(["A1"]);
    await expect(buy(["A9", "A1"])).rejects.toBeInstanceOf(SerialUnitError);
    expect(await db.product_serial_units.count()).toBe(1);
    expect(await stock(testere)).toBe(1);
    expect(await db.purchases.count()).toBe(1);
  });

  it("seri takipsiz ürüne seri numarası girilemez", async () => {
    await expect(
      createPurchase(ctx, { supplierId: supplier, lines: [{ productId: buji, quantity: 1, unitPriceKurus: 100, taxMode: "NONE", taxRate: 0, serialNumbers: ["X"] }] }, { receive: false })
    ).rejects.toThrow(/seri takipli bir ürün değil/);
  });
});

describe("makine satışı (§5.3, AC-027, AC-039, TC-028, TC-040)", () => {
  it("seçilen birim satılır: SOLD, makine kaydı müşteriye bağlı, stok düşer, birim maliyeti alış fiyatından", async () => {
    await buy(["A1", "A2"]);
    const [a1] = (await getInStockUnits(testere)).filter((u) => u.serial_number === "A1");

    const sale = await createSale(ctx, { customerId: ali, lines: [sellLine(a1.id)] }, { finalize: true, payment: { amountKurus: 600000, method: "CASH" } });

    const sold = (await db.product_serial_units.get(a1.id))!;
    expect(sold.status).toBe("SOLD");
    expect(await stock(testere)).toBe(1);

    const machine = (await db.machines.get(sold.machine_id as string))!;
    expect(machine).toMatchObject({
      customer_id: ali,
      brand: "Stihl",
      model: "MS 180",
      type: "Zincirli testere",
      serial_number: "A1",
      is_temporary: false,
      sale_id: sale.id,
      sale_price: 6000,
    });
    expect(machine.internal_number).toMatch(/^MK-/);

    const [item] = await getSaleItems(sale.id);
    expect(item).toMatchObject({ serial_unit_id: a1.id, machine_id: machine.id, unit_cost_snapshot: 4000 });
    expect(sold.sale_item_id).toBe(item.id);

    const out = (await db.stock_movements.toArray()).find((m) => m.movement_type === "SALE_OUT");
    expect(out).toMatchObject({ serial_unit_id: a1.id, quantity: -1, unit_cost: 4000 });
  });

  it("aynı birim iki kez satılamaz; ikinci satış reddedilir ve hiçbir şey yazılmaz (AC-039)", async () => {
    await buy(["A1"]);
    const [unit] = await getInStockUnits(testere);
    await createSale(ctx, { customerId: ali, lines: [sellLine(unit.id)] }, { finalize: true, payment: { amountKurus: 600000, method: "CASH" } });

    const salesBefore = await db.sales.count();
    await expect(createSale(ctx, { customerId: veli, lines: [sellLine(unit.id)] }, { finalize: true })).rejects.toThrow(/stokta değil/);
    expect(await db.sales.count()).toBe(salesBefore);
    expect(await db.machines.count()).toBe(1);
  });

  it("taslaktaki birim ayrılmaz: başka satış alırsa taslak kesinleşirken reddedilir", async () => {
    await buy(["A1"]);
    const [unit] = await getInStockUnits(testere);
    const draft = await createSale(ctx, { customerId: ali, lines: [sellLine(unit.id)] }, { finalize: false });
    expect((await db.product_serial_units.get(unit.id))?.status).toBe("IN_STOCK");

    await createSale(ctx, { customerId: veli, lines: [sellLine(unit.id)] }, { finalize: true });
    await expect(finalizeSale(ctx, draft.id)).rejects.toThrow(/stokta değil/);
    expect((await db.sales.get(draft.id))?.status).toBe("DRAFT");
  });

  it("makine satışı için müşteri, birim ve miktar 1 zorunludur; aynı birim iki satırda olamaz", async () => {
    await buy(["A1", "A2"]);
    const [u1] = await getInStockUnits(testere);

    await expect(createSale(ctx, { lines: [sellLine(u1.id)] }, { finalize: false })).rejects.toThrow(/müşteri seçin/);
    await expect(createSale(ctx, { customerId: ali, lines: [{ ...sellLine(u1.id), serialUnitId: undefined }] }, { finalize: false })).rejects.toThrow(/birimi seçin/);
    await expect(createSale(ctx, { customerId: ali, lines: [{ ...sellLine(u1.id), quantity: 2 }] }, { finalize: false })).rejects.toThrow(/miktar 1/);
    await expect(createSale(ctx, { customerId: ali, lines: [sellLine(u1.id), sellLine(u1.id)] }, { finalize: false })).rejects.toThrow(/birden fazla/);
    await expect(
      createSale(ctx, { customerId: ali, lines: [{ productId: buji, quantity: 1, unitPriceKurus: 100, taxMode: "NONE", taxRate: 0, serialUnitId: u1.id }] }, { finalize: false })
    ).rejects.toThrow(/birim seçilemez/);
  });

  it("makine kaydı müşteriye ait olarak zaten varsa aynı kayıt kullanılır, çift kayıt açılmaz (§5.3)", async () => {
    await buy(["A1"]);
    const [unit] = await getInStockUnits(testere);
    const existing = await createMachine(ctx, { customer_id: ali, type: "Zincirli testere", brand: "Stihl", model: "MS 180", serial_number: "A1", is_temporary: false });

    await createSale(ctx, { customerId: ali, lines: [sellLine(unit.id)] }, { finalize: true, payment: { amountKurus: 600000, method: "CASH" } });

    expect(await db.machines.count()).toBe(1);
    const machine = (await db.machines.get(existing.id))!;
    expect(machine).toMatchObject({ customer_id: ali, sale_price: 6000 });
    expect((await db.product_serial_units.get(unit.id))?.machine_id).toBe(existing.id);
  });

  it("makine kaydı başka müşteri adınaysa sahiplik geçmişe yazılarak devredilir", async () => {
    await buy(["A1"]);
    const [unit] = await getInStockUnits(testere);
    const existing = await createMachine(ctx, { customer_id: veli, type: "Zincirli testere", brand: "Stihl", model: "MS 180", serial_number: "A1", is_temporary: false });

    await createSale(ctx, { customerId: ali, lines: [sellLine(unit.id)] }, { finalize: true, payment: { amountKurus: 600000, method: "CASH" } });

    expect(await db.machines.count()).toBe(1);
    expect((await db.machines.get(existing.id))?.customer_id).toBe(ali);
    const [h] = await db.machine_ownership_history.toArray();
    expect(h).toMatchObject({ old_customer_id: veli, new_customer_id: ali });
    expect(h.reason).toMatch(/Makine satışı/);
  });

  it("seri numarasız birim de satılır; makine iç numarasıyla tanınır", async () => {
    await buy([""], 1);
    const [unit] = await getInStockUnits(testere);
    await createSale(ctx, { customerId: ali, lines: [sellLine(unit.id)] }, { finalize: true, payment: { amountKurus: 600000, method: "CASH" } });
    const machine = (await db.machines.toArray())[0];
    expect(machine.serial_number).toBeUndefined();
    expect(machine.internal_number).toBeTruthy();
  });

  it("makine satışı veresiye de olabilir: müşteri borcu bakiyeye yansır", async () => {
    await buy(["A1"]);
    const [unit] = await getInStockUnits(testere);
    const sale = await createSale(ctx, { customerId: ali, lines: [sellLine(unit.id)] }, { finalize: true, payment: { amountKurus: 100000, method: "CASH" } });
    const { getSaleBalance } = await import("@/lib/sales/service");
    expect((await getSaleBalance(sale.id)).remaining).toBe(500000);
  });
});

describe("eşitleme sırası", () => {
  it("birim önce, hareket sonra; makine satıştan önce", async () => {
    await buy(["A1"]);
    const [unit] = await getInStockUnits(testere);
    await createSale(ctx, { customerId: ali, lines: [sellLine(unit.id)] }, { finalize: true, payment: { amountKurus: 600000, method: "CASH" } });

    const { getPendingItems } = await import("@/lib/sync/queue");
    const order = [...new Set((await getPendingItems()).map((i) => i.table_name))];
    const idx = (t: string) => order.indexOf(t);
    expect(idx("product_serial_units")).toBeLessThan(idx("stock_movements"));
    expect(idx("machines")).toBeLessThan(idx("sales"));
    expect(idx("machines")).toBeLessThan(idx("product_serial_units") + 99);
    expect(idx("stock_movements")).toBeLessThan(idx("sale_items"));
  });
});
