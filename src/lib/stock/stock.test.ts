import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createProduct } from "@/lib/products/service";
import type { ProductFields } from "@/lib/products/schema";
import { calcBalance, getBalances, getProductBalance } from "./ledger";
import {
  InsufficientStockError,
  StockRuleError,
  addStock,
  adjustStock,
  moveDamagedStock,
  recordMovement,
} from "./service";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

const fields = (over: Partial<ProductFields> = {}): ProductFields => ({
  name: "Buji",
  unit: "ADET",
  is_serial_tracked: false,
  default_sale_price: 100,
  default_tax_mode: "INCLUSIVE",
  default_tax_rate: 20,
  ...over,
});

async function newProduct(over: Partial<ProductFields> = {}) {
  return createProduct(ctx, fields(over));
}

beforeEach(async () => {
  await db.products.clear();
  await db.stock_movements.clear();
  await db.sync_queue.clear();
  await db.audit_logs.clear();
});

describe("calcBalance", () => {
  it("kovaları ayrı toplar, kayan nokta hatası yapmaz", () => {
    const b = calcBalance([
      { quantity: 0.1 },
      { quantity: 0.2 },
      { quantity: -0.1, bucket: "AVAILABLE" },
      { quantity: 3, bucket: "DAMAGED" },
    ]);
    expect(b).toEqual({ available: 0.2, damaged: 3 });
  });

  it("bucket alanı olmayan eski kayıt satılabilir sayılır", () => {
    expect(calcBalance([{ quantity: 5 }]).available).toBe(5);
  });
});

describe("addStock", () => {
  it("giriş bakiyeyi artırır ve INSERT olarak kuyruğa yazılır", async () => {
    const p = await newProduct();
    await db.sync_queue.clear();

    const m = await addStock(ctx, { productId: p.id, quantity: 12, unitCost: 80, note: "Sayım" });

    expect((await getProductBalance(p.id)).available).toBe(12);
    const [q] = await db.sync_queue.toArray();
    expect(q).toMatchObject({ table_name: "stock_movements", record_id: m.id, operation: "INSERT" });
    expect(q.payload).toMatchObject({ product_id: p.id, quantity: 12, bucket: "AVAILABLE", movement_type: "OPENING", unit_cost: 80 });
  });

  it("sıfır veya negatif girişi reddeder", async () => {
    const p = await newProduct();
    await expect(addStock(ctx, { productId: p.id, quantity: 0 })).rejects.toBeInstanceOf(StockRuleError);
    await expect(addStock(ctx, { productId: p.id, quantity: -2 })).rejects.toBeInstanceOf(StockRuleError);
    expect(await db.stock_movements.count()).toBe(0);
  });

  it("5'ten fazla ondalık basamağı reddeder", async () => {
    const p = await newProduct();
    await expect(addStock(ctx, { productId: p.id, quantity: 1.00001 })).rejects.toBeInstanceOf(StockRuleError);
  });

  it("seri takipli ürüne elle hareket yapılamaz", async () => {
    const p = await newProduct({ is_serial_tracked: true });
    await expect(addStock(ctx, { productId: p.id, quantity: 1 })).rejects.toBeInstanceOf(StockRuleError);
  });

  it("başka işletmenin ürününe hareket yapılamaz", async () => {
    const p = await newProduct();
    await expect(
      addStock({ ...ctx, businessId: "baska" }, { productId: p.id, quantity: 1 })
    ).rejects.toBeInstanceOf(StockRuleError);
  });
});

describe("adjustStock", () => {
  it("10 → 7 düzeltmesi −3 fark, neden ve audit log üretir (AC-031)", async () => {
    const p = await newProduct();
    await addStock(ctx, { productId: p.id, quantity: 10 });
    await db.sync_queue.clear();

    const r = await adjustStock(ctx, { productId: p.id, newQuantity: 7, reason: "Sayım farkı" });

    expect(r).toMatchObject({ before: 10, after: 7 });
    expect(r.movement).toMatchObject({ movement_type: "ADJUSTMENT_OUT", quantity: -3, note: "Sayım farkı" });
    expect((await getProductBalance(p.id)).available).toBe(7);

    const [log] = await db.audit_logs.toArray();
    expect(log).toMatchObject({
      entity_type: "products",
      reason: "Sayım farkı",
      old_value: { stock_available: 10 },
    });
    // hareket + audit log iki ayrı paket
    expect((await db.sync_queue.toArray()).map((q) => q.table_name).sort()).toEqual(["audit_logs", "stock_movements"]);
  });

  it("artış ADJUSTMENT_IN olur", async () => {
    const p = await newProduct();
    const r = await adjustStock(ctx, { productId: p.id, newQuantity: 4, reason: "Bulundu" });
    expect(r.movement).toMatchObject({ movement_type: "ADJUSTMENT_IN", quantity: 4 });
  });

  it("neden yazılmadan, aynı miktarla veya negatif miktarla düzeltme yapılmaz", async () => {
    const p = await newProduct();
    await addStock(ctx, { productId: p.id, quantity: 5 });
    await expect(adjustStock(ctx, { productId: p.id, newQuantity: 3, reason: "  " })).rejects.toBeInstanceOf(StockRuleError);
    await expect(adjustStock(ctx, { productId: p.id, newQuantity: 5, reason: "x" })).rejects.toBeInstanceOf(StockRuleError);
    await expect(adjustStock(ctx, { productId: p.id, newQuantity: -1, reason: "x" })).rejects.toBeInstanceOf(StockRuleError);
    expect(await db.stock_movements.count()).toBe(1);
    expect(await db.audit_logs.count()).toBe(0);
  });
});

describe("negatif stok kuralı (ST-002, ST-004)", () => {
  const out = (productId: string, quantity: number, over = {}) => ({
    productId,
    type: "SALE_OUT" as const,
    quantity: -quantity,
    ...over,
  });

  it("varsayılan olarak stoktan fazla çıkış engellenir ve hareket yazılmaz", async () => {
    const p = await newProduct();
    await addStock(ctx, { productId: p.id, quantity: 3 });

    const err = await recordMovement(ctx, out(p.id, 4)).catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientStockError);
    expect(err.available).toBe(3);
    expect(await db.stock_movements.count()).toBe(1);
  });

  it("eldeki stok kadar çıkış serbesttir, sıfıra iner", async () => {
    const p = await newProduct();
    await addStock(ctx, { productId: p.id, quantity: 3 });
    await recordMovement(ctx, out(p.id, 3));
    expect((await getProductBalance(p.id)).available).toBe(0);
  });

  it("ayar açıksa eksiye düşmek için neden gerekir", async () => {
    const p = await newProduct();
    const lenient = { ...ctx, allowNegativeStock: true };

    await expect(recordMovement(lenient, out(p.id, 2))).rejects.toBeInstanceOf(StockRuleError);
    await recordMovement(lenient, out(p.id, 2, { note: "Müşteri bekliyor, mal yolda" }));
    expect((await getProductBalance(p.id)).available).toBe(-2);
  });

  it("hasarlı stok ayar açık olsa da eksiye düşemez", async () => {
    const p = await newProduct();
    const lenient = { ...ctx, allowNegativeStock: true };
    await recordMovement(lenient, { productId: p.id, type: "DAMAGED_IN", bucket: "DAMAGED", quantity: 2 });

    await expect(
      recordMovement(lenient, { productId: p.id, type: "DAMAGED_DISPOSE", bucket: "DAMAGED", quantity: -3, note: "x" })
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect((await getProductBalance(p.id)).damaged).toBe(2);
  });

  it("hasarlı hareket satılabilir stoğu etkilemez", async () => {
    const p = await newProduct();
    await addStock(ctx, { productId: p.id, quantity: 5 });
    await recordMovement(ctx, { productId: p.id, type: "DAMAGED_IN", bucket: "DAMAGED", quantity: 2 });
    expect(await getProductBalance(p.id)).toEqual({ available: 5, damaged: 2 });
  });
});

describe("getBalances", () => {
  it("ürün başına bakiye döner", async () => {
    const a = await newProduct({ name: "A" });
    const b = await newProduct({ name: "B" });
    await addStock(ctx, { productId: a.id, quantity: 3 });
    await addStock(ctx, { productId: b.id, quantity: 8 });
    await adjustStock(ctx, { productId: b.id, newQuantity: 6, reason: "Fire" });

    const balances = await getBalances(ctx.businessId);
    expect(balances.get(a.id)?.available).toBe(3);
    expect(balances.get(b.id)?.available).toBe(6);
  });
});

describe("InsufficientStockError", () => {
  it("mevcut miktarı taşır", () => {
    expect(new InsufficientStockError(2).available).toBe(2);
  });
});

describe("moveDamagedStock (Adım 2.5)", () => {
  async function productWith(available: number) {
    const p = await newProduct();
    await addStock(ctx, { productId: p.id, quantity: available });
    return p;
  }

  it("hasarlıya ayırma: satılabilir azalır, hasarlı artar (çift hareket, ortak kaynak)", async () => {
    const p = await productWith(10);
    const moves = await moveDamagedStock(ctx, { productId: p.id, action: "MARK_DAMAGED", quantity: 3, reason: "Düştü" });

    expect(await getProductBalance(p.id)).toEqual({ available: 7, damaged: 3 });
    expect(moves).toHaveLength(2);
    expect(new Set(moves.map((m) => m.source_id)).size).toBe(1);
    expect(moves.map((m) => m.bucket).sort()).toEqual(["AVAILABLE", "DAMAGED"]);
  });

  it("onarıldı: hasarlıdan satılabilire geri döner", async () => {
    const p = await productWith(10);
    await moveDamagedStock(ctx, { productId: p.id, action: "MARK_DAMAGED", quantity: 4, reason: "Hasarlı geldi" });
    await moveDamagedStock(ctx, { productId: p.id, action: "REPAIRED", quantity: 1, reason: "Onarıldı" });
    expect(await getProductBalance(p.id)).toEqual({ available: 7, damaged: 3 });
  });

  it("imha: yalnızca hasarlı azalır", async () => {
    const p = await productWith(10);
    await moveDamagedStock(ctx, { productId: p.id, action: "MARK_DAMAGED", quantity: 2, reason: "Kırık" });
    const moves = await moveDamagedStock(ctx, { productId: p.id, action: "DISPOSE", quantity: 2, reason: "Hurda" });
    expect(moves).toHaveLength(1);
    expect(await getProductBalance(p.id)).toEqual({ available: 8, damaged: 0 });
  });

  it("olmayan stok hasarlıya ayrılamaz, ayar açık olsa bile; hiçbir hareket yazılmaz", async () => {
    const p = await productWith(2);
    const before = await db.stock_movements.count();
    await expect(
      moveDamagedStock({ ...ctx, allowNegativeStock: true }, { productId: p.id, action: "MARK_DAMAGED", quantity: 5, reason: "x" })
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await db.stock_movements.count()).toBe(before);
  });

  it("hasarlı stoktan fazla onarılamaz veya imha edilemez", async () => {
    const p = await productWith(5);
    await expect(
      moveDamagedStock(ctx, { productId: p.id, action: "REPAIRED", quantity: 1, reason: "x" })
    ).rejects.toBeInstanceOf(InsufficientStockError);
    await expect(
      moveDamagedStock(ctx, { productId: p.id, action: "DISPOSE", quantity: 1, reason: "x" })
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await getProductBalance(p.id)).toEqual({ available: 5, damaged: 0 });
  });

  it("neden olmadan işlem yapılmaz; audit log yazılır", async () => {
    const p = await productWith(5);
    await expect(
      moveDamagedStock(ctx, { productId: p.id, action: "MARK_DAMAGED", quantity: 1, reason: " " })
    ).rejects.toBeInstanceOf(StockRuleError);

    await moveDamagedStock(ctx, { productId: p.id, action: "MARK_DAMAGED", quantity: 1, reason: "Çizik" });
    const [log] = await db.audit_logs.toArray();
    expect(log).toMatchObject({
      reason: "Çizik",
      old_value: { stock_available: 5, stock_damaged: 0 },
      new_value: { stock_available: 4, stock_damaged: 1, action: "MARK_DAMAGED" },
    });
  });
});
