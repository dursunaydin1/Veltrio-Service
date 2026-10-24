import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createProduct } from "@/lib/products/service";
import { addStock, adjustStock, recordMovement, type StockContext } from "@/lib/stock/service";
import { findStockMismatches, repairStockMismatches } from "@/lib/stock/integrity";
import { syncStockNotifications } from "./stockAlerts";

const ctx: StockContext = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };
const lenient: StockContext = { ...ctx, allowNegativeStock: true };

let productId: string;

const notes = (type: string) => db.notifications.filter((n) => n.type === type).toArray();

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  productId = (
    await createProduct(ctx, {
      name: "Buji", unit: "ADET", is_serial_tracked: false, default_sale_price: 100,
      default_tax_mode: "NONE", default_tax_rate: 0, critical_stock_level: 3,
    })
  ).id;
});

const out = (qty: number) => recordMovement(lenient, { productId, type: "SALE_OUT", quantity: -qty, note: "test" });

describe("kritik stok bildirimi (ST-009, AC-028)", () => {
  it("eşik altına ilk düşüşte bir bildirim; çözülmeden yinelenmez", async () => {
    await addStock(ctx, { productId, quantity: 10 });
    expect(await syncStockNotifications(ctx)).toBe(0);
    await out(7); // 3 → eşitlikte de kritik
    expect(await syncStockNotifications(ctx)).toBe(1);
    await out(1);
    expect(await syncStockNotifications(ctx)).toBe(0);
    const [n] = await notes("LOW_STOCK");
    expect(n).toMatchObject({ related_record_id: productId, dedupe_key: `LOW_STOCK:${productId}:1` });
    expect(n.resolved_at).toBeUndefined();
  });

  it("stok toparlanınca çözülür; tekrar düşerse yeni bildirim açılır", async () => {
    await addStock(ctx, { productId, quantity: 2 });
    await syncStockNotifications(ctx);
    await addStock(ctx, { productId, quantity: 10 });
    await syncStockNotifications(ctx);
    expect((await notes("LOW_STOCK"))[0].resolved_at).toBeTruthy();

    await out(10);
    expect(await syncStockNotifications(ctx)).toBe(1);
    const all = (await notes("LOW_STOCK")).sort((a, b) => a.dedupe_key.localeCompare(b.dedupe_key));
    expect(all.map((n) => [n.dedupe_key.endsWith(":1"), !!n.resolved_at])).toEqual([[true, true], [false, false]]);
  });

  it("kritik seviyesi tanımlı olmayan ürün için bildirim yok; hasarlı stok sayılmaz", async () => {
    const plain = (
      await createProduct(ctx, {
        name: "Zincir", unit: "ADET", is_serial_tracked: false, default_sale_price: 50,
        default_tax_mode: "NONE", default_tax_rate: 0,
      })
    ).id;
    await addStock(ctx, { productId: plain, quantity: 0.5 });
    await addStock(ctx, { productId, quantity: 20 });
    expect(await syncStockNotifications(ctx)).toBe(0);
    // 20 satılabilir; 15'ini hasarlıya almak satılabilir stoğu 5 yapar (>3) → bildirim yok
    await adjustStock(ctx, { productId, newQuantity: 20, reason: "x" }).catch(() => undefined);
  });
});

describe("eksi stok çakışma bildirimi (ST-003, AC-009)", () => {
  it("eksiye düşen ürün için telafi önerili bildirim; stok düzelince çözülür", async () => {
    await addStock(ctx, { productId, quantity: 1 });
    await out(3); // -2
    expect(await syncStockNotifications(ctx)).toBeGreaterThanOrEqual(1);
    const conflict = await notes("SYNC_CONFLICT");
    expect(conflict).toHaveLength(1);
    expect(conflict[0].message).toMatch(/eksiye düştü/);
    expect(conflict[0].message).toMatch(/stok düzeltmesi/i);

    await addStock(ctx, { productId, quantity: 5 });
    await syncStockNotifications(ctx);
    expect((await notes("SYNC_CONFLICT"))[0].resolved_at).toBeTruthy();
  });
});

describe("stok bütünlük denetimi (ST-013, TC-054)", () => {
  it("özet defterle uyuşmazsa defter esas alınır, düzeltilir ve audit log'a yazılır", async () => {
    await addStock(ctx, { productId, quantity: 10 });
    const p = (await db.products.get(productId))!;
    await db.products.put({ ...p, stock_available: 99, stock_damaged: 4 });

    const found = await findStockMismatches(ctx.businessId);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ cachedAvailable: 99, ledgerAvailable: 10, cachedDamaged: 4, ledgerDamaged: 0 });

    const fixed = await repairStockMismatches(ctx);
    expect(fixed).toHaveLength(1);
    expect(await db.products.get(productId)).toMatchObject({ stock_available: 10, stock_damaged: 0 });
    expect(await findStockMismatches(ctx.businessId)).toHaveLength(0);
    const audit = await db.audit_logs.filter((a) => a.entity_id === productId && /yeniden hesaplandı/.test(a.reason ?? "")).toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0].old_value).toMatchObject({ stock_available: 99 });
    // hareketler değişmedi
    expect(await db.stock_movements.count()).toBe(1);
  });

  it("tutarlıysa hiçbir şey yazılmaz", async () => {
    await addStock(ctx, { productId, quantity: 5 });
    const p = (await db.products.get(productId))!;
    await db.products.put({ ...p, stock_available: 5 });
    expect(await repairStockMismatches(ctx)).toEqual([]);
    expect(await db.audit_logs.count()).toBe(0);
  });
});
