import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getSupplierBalance, reversePayment } from "@/lib/finance/service";
import { createProduct } from "@/lib/products/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { createSupplier, setSupplierArchived } from "@/lib/suppliers/service";
import {
  PurchaseRuleError,
  cancelDraftPurchase,
  createPurchase,
  getPurchaseBalance,
  getPurchaseItems,
  payPurchase,
  receivePurchase,
  updateDraftPurchase,
  type PurchaseInput,
} from "./service";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

let supplierId: string;
let buji: string;
let zincir: string;

const line = (productId: string, quantity: number, unitPriceKurus: number, over = {}) => ({
  productId,
  quantity,
  unitPriceKurus,
  taxMode: "NONE" as const,
  taxRate: 0,
  ...over,
});

const input = (over: Partial<PurchaseInput> = {}): PurchaseInput => ({
  supplierId,
  lines: [line(buji, 10, 5000)],
  ...over,
});

const stock = async (id: string) => (await getProductBalance(id)).available;

beforeEach(async () => {
  for (const t of [
    db.suppliers, db.products, db.stock_movements, db.purchases, db.purchase_items,
    db.payments, db.opening_balances, db.counters, db.sync_queue, db.audit_logs,
  ]) {
    await t.clear();
  }
  supplierId = (await createSupplier(ctx, { name: "Orman Makine" })).id;
  const base = { unit: "ADET", is_serial_tracked: false, default_sale_price: 100, default_tax_mode: "NONE" as const, default_tax_rate: 0 };
  buji = (await createProduct(ctx, { ...base, name: "NGK Buji" })).id;
  zincir = (await createProduct(ctx, { ...base, name: "Zincir" })).id;
});

describe("createPurchase — teslim alınmış (RECEIVED)", () => {
  it("AL-… numarası, stok girişi, son alış fiyatı ve tedarikçi borcu", async () => {
    const p = await createPurchase(ctx, input({ lines: [line(buji, 10, 5000), line(zincir, 2, 12000)] }), { receive: true });

    expect(p.document_no).toMatch(/^AL-DEMO-AB23-\d{4}-00001$/);
    expect(p).toMatchObject({ status: "RECEIVED", total_amount: 740 }); // 10×50 + 2×120
    expect(p.received_at).toBeTruthy();

    expect(await stock(buji)).toBe(10);
    expect(await stock(zincir)).toBe(2);
    expect((await db.products.get(buji))?.last_purchase_price).toBe(50);

    const move = (await db.stock_movements.toArray()).find((m) => m.product_id === buji);
    expect(move).toMatchObject({ movement_type: "PURCHASE_IN", quantity: 10, unit_cost: 50, source_type: "PURCHASE", source_id: p.id });

    const items = await getPurchaseItems(p.id);
    expect(items.map((i) => i.description_snapshot)).toEqual(["NGK Buji", "Zincir"]);
    expect(items.every((i) => !!i.stock_movement_id)).toBe(true);

    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe(74000);
  });

  it("birim maliyet KDV dahil satır toplamından hesaplanır (KDV indirilmez)", async () => {
    await createPurchase(
      ctx,
      input({ lines: [line(buji, 4, 10000, { taxMode: "EXCLUSIVE", taxRate: 20, discountKurus: 4000 })] }),
      { receive: true }
    );
    // (4×100 − 40) × 1,20 = 432 → birim 108
    expect((await db.products.get(buji))?.last_purchase_price).toBe(108);
    expect((await db.stock_movements.toArray())[0].unit_cost).toBe(108);
  });

  it("ödemeyle birlikte: tedarikçi borcu net, alım bakiyesi kalan gösterir; ters kayıt geri alır", async () => {
    const p = await createPurchase(ctx, input(), { receive: true, payment: { amountKurus: 20000, method: "CASH" } });

    expect(await getPurchaseBalance(p.id)).toMatchObject({ total: 50000, paid: 20000, remaining: 30000 });
    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe(30000);

    const pay = await payPurchase(ctx, p.id, { amountKurus: 30000, method: "BANK_TRANSFER" });
    expect((await getPurchaseBalance(p.id)).remaining).toBe(0);

    await reversePayment(ctx, pay.id, "Hatalı giriş");
    expect((await getPurchaseBalance(p.id)).remaining).toBe(30000);
  });

  it("hızlı alım: yalnızca toplam tutar, stok değişmez, tedarikçi borcuna yazılır (§9.5)", async () => {
    const p = await createPurchase(ctx, { supplierId, lines: [], manualTotalKurus: 150000 }, { receive: true });
    expect(p).toMatchObject({ status: "RECEIVED", total_amount: 1500 });
    expect(await db.stock_movements.count()).toBe(0);
    expect(await getPurchaseItems(p.id)).toHaveLength(0);
    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe(150000);
  });

  it("numaralar sırayla artar", async () => {
    const a = await createPurchase(ctx, input(), { receive: true });
    const b = await createPurchase(ctx, input(), { receive: true });
    expect(a.document_no.endsWith("00001")).toBe(true);
    expect(b.document_no.endsWith("00002")).toBe(true);
  });
});

describe("taslak (DRAFT) — ST-006", () => {
  it("taslak stok ve finans hareketi üretmez; teslim alınca üretir", async () => {
    const d = await createPurchase(ctx, input(), { receive: false });
    expect(d.status).toBe("DRAFT");
    expect(await stock(buji)).toBe(0);
    expect(await db.stock_movements.count()).toBe(0);
    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe(0);

    const r = await receivePurchase(ctx, d.id);
    expect(r.status).toBe("RECEIVED");
    expect(await stock(buji)).toBe(10);
    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe(50000);
  });

  it("taslak düzenlenir: satırlar yenilenir; teslim alınmış alım düzenlenemez", async () => {
    const d = await createPurchase(ctx, input(), { receive: false });
    await updateDraftPurchase(ctx, d.id, input({ lines: [line(zincir, 3, 10000)], notes: "Güncel" }));

    const items = await getPurchaseItems(d.id);
    expect(items.map((i) => [i.description_snapshot, i.quantity])).toEqual([["Zincir", 3]]);
    expect(await db.purchases.get(d.id)).toMatchObject({ total_amount: 300, notes: "Güncel" });

    await receivePurchase(ctx, d.id);
    await expect(updateDraftPurchase(ctx, d.id, input())).rejects.toThrow(/Yalnızca taslak/);
  });

  it("taslak düzenleme eski satırları siler (henüz gönderilmemişse kuyrukta iz bırakmaz)", async () => {
    const d = await createPurchase(ctx, input(), { receive: false });
    await updateDraftPurchase(ctx, d.id, input({ lines: [line(zincir, 1, 100)] }));
    const itemOps = (await db.sync_queue.toArray()).filter((q) => q.table_name === "purchase_items");
    expect(itemOps).toHaveLength(1);
    expect(itemOps[0]).toMatchObject({ operation: "INSERT" });
  });

  it("iki kez teslim alınamaz; taslak iptal edilir (neden zorunlu) ve bakiyeye girmez", async () => {
    const d = await createPurchase(ctx, input(), { receive: false });
    await expect(cancelDraftPurchase(ctx, d.id, " ")).rejects.toBeInstanceOf(PurchaseRuleError);
    await cancelDraftPurchase(ctx, d.id, "Vazgeçildi");
    expect((await db.purchases.get(d.id))?.status).toBe("CANCELLED");
    expect(await db.audit_logs.count()).toBe(1);
    await expect(receivePurchase(ctx, d.id)).rejects.toThrow(/Yalnızca taslak/);

    const r = await createPurchase(ctx, input(), { receive: true });
    await expect(receivePurchase(ctx, r.id)).rejects.toThrow(/Yalnızca taslak/);
    await expect(cancelDraftPurchase(ctx, r.id, "x")).rejects.toThrow(/Yalnızca taslak/);
    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe(50000);
  });

  it("taslağa ödeme bağlanamaz", async () => {
    await expect(
      createPurchase(ctx, input(), { receive: false, payment: { amountKurus: 100, method: "CASH" } })
    ).rejects.toThrow(/teslim alındıktan sonra/);
    const d = await createPurchase(ctx, input(), { receive: false });
    await expect(payPurchase(ctx, d.id, { amountKurus: 100, method: "CASH" })).rejects.toThrow(/teslim alınmış/);
  });
});

describe("doğrulamalar", () => {
  it("tedarikçi yok / arşivli, başka işletme", async () => {
    await expect(createPurchase(ctx, input({ supplierId: "yok" }), { receive: false })).rejects.toBeInstanceOf(PurchaseRuleError);
    await expect(createPurchase({ ...ctx, businessId: "baska" }, input(), { receive: false })).rejects.toBeInstanceOf(PurchaseRuleError);
    await setSupplierArchived(ctx, supplierId, true);
    await expect(createPurchase(ctx, input(), { receive: false })).rejects.toThrow(/Arşivlenmiş/);
  });

  it("satır ve toplam kuralları: ikisi birden olmaz, ikisi de olmazsa olmaz", async () => {
    await expect(createPurchase(ctx, { supplierId, lines: [] }, { receive: false })).rejects.toThrow(/toplam tutarı girin/);
    await expect(
      createPurchase(ctx, input({ manualTotalKurus: 100 }), { receive: false })
    ).rejects.toThrow(/ayrıca toplam tutar/);
    await expect(createPurchase(ctx, { supplierId, lines: [], manualTotalKurus: 0 }, { receive: false })).rejects.toBeInstanceOf(PurchaseRuleError);
    await expect(createPurchase(ctx, input({ lines: [line(buji, 0, 100)] }), { receive: false })).rejects.toThrow(/Miktar/);
  });

  it("pasif ürün alıma eklenemez; hiçbir şey yazılmaz", async () => {
    await db.products.update(zincir, { archived_at: new Date().toISOString() });
    await expect(createPurchase(ctx, input({ lines: [line(zincir, 1, 100)] }), { receive: true })).rejects.toThrow(/pasif/);

    expect(await db.purchases.count()).toBe(0);
    expect(await db.stock_movements.count()).toBe(0);
  });

  it("geçersiz tarih reddedilir; verilen tarih kaydedilir", async () => {
    await expect(createPurchase(ctx, input({ purchaseDate: "22.10.2026" }), { receive: false })).rejects.toThrow(/tarihi geçersiz/);
    const p = await createPurchase(ctx, input({ purchaseDate: "2026-10-01", supplierRef: "İrs-77" }), { receive: false });
    expect(p.purchase_date.startsWith("2026-10-01")).toBe(true);
    expect(p.supplier_ref).toBe("İrs-77");
  });
});

describe("eşitleme", () => {
  it("üst kayıt önce: alım kuyruğa satırlardan ve hareketlerden doğru sırayla gider", async () => {
    await db.sync_queue.clear();
    await createPurchase(ctx, input(), { receive: true });
    const { getPendingItems } = await import("@/lib/sync/queue");
    const tablesInOrder = [...new Set((await getPendingItems()).map((i) => i.table_name))];
    const idx = (t: string) => tablesInOrder.indexOf(t);
    expect(idx("products")).toBeLessThan(idx("stock_movements"));
    expect(idx("stock_movements")).toBeLessThan(idx("purchase_items"));
    expect(idx("purchases")).toBeLessThan(idx("purchase_items"));
  });
});
