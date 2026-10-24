import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createProduct } from "@/lib/products/service";
import { addStock, recordMovement } from "@/lib/stock/service";
import { syncStockNotifications } from "@/lib/notifications/stockAlerts";
import { applyPushItem } from "@/lib/sync/apply";
import { enqueue, getPendingItems, markError, markSynced } from "@/lib/sync/queue";
import { getProductBalance } from "@/lib/stock/ledger";

/**
 * Çok cihaz ve çevrimdışı eşitleme senaryoları (Adım 7.3). Sunucu, bellek içi bir taklittir;
 * "cihaz" = yerel veritabanının o andaki içeriği. Gerçek sunucuya karşı karşılıkları e2e/server.e2e.ts içindedir.
 */

type Row = Record<string, unknown>;
const B = "00000000-0000-0000-0000-000000000001";
const ctxA = { businessId: B, deviceCode: "DEMO-AAAA", actorId: "u1", allowNegativeStock: true };

/** Yalnızca ekleme / sürüm kontrolü yapan minimal sunucu taklidi. */
function fakeServer() {
  const tables: Record<string, Row[]> = {};
  const client = {
    from: (table: string) => {
      const rows = (tables[table] ??= []);
      let filters: [string, unknown][] = [];
      let op: "select" | "insert" = "select";
      let payload: Row = {};
      const q = {
        select: () => q,
        insert: (p: Row) => { op = "insert"; payload = p; return q; },
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        maybeSingle: () => q,
        then: (ok: (v: unknown) => unknown) => {
          if (op === "insert") {
            if (rows.some((r) => r.id === payload.id)) return Promise.resolve({ error: { code: "23505", message: "dup" } }).then(ok);
            rows.push({ version: 1, ...payload });
            return Promise.resolve({ error: null }).then(ok);
          }
          const hit = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
          filters = [];
          return Promise.resolve({ data: hit[0] ?? null, error: null }).then(ok);
        },
      };
      return q;
    },
  };
  return { tables, supabase: client as never };
}

/** Kuyruktaki her şeyi sunucuya gönderir (uygulamadaki eşitleme döngüsünün çekirdeği). */
async function push(server: ReturnType<typeof fakeServer>) {
  const results = [];
  for (const item of await getPendingItems()) {
    const r = await applyPushItem({ supabase: server.supabase, businessId: B }, { id: item.id, table_name: item.table_name as never, record_id: item.record_id, operation: item.operation, payload: item.payload });
    if (r.success) await markSynced(item.id);
    else await markError(item.id, r.error ?? "hata");
    results.push(r);
  }
  return results;
}

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
});

describe("iki cihaz son ürünü tüketir (AC-009, TC-012)", () => {
  it("iki satış çıkışı da sunucuda kalır (hareket silinmez); cihaz eşitlenince stok eksiye düşer ve telafi bildirimi gelir", async () => {
    const server = fakeServer();
    const product = await createProduct(ctxA, { name: "Buji", unit: "ADET", is_serial_tracked: false, default_sale_price: 100, default_tax_mode: "NONE", default_tax_rate: 0 });
    await addStock(ctxA, { productId: product.id, quantity: 1 });
    await push(server);
    expect(server.tables.stock_movements).toHaveLength(1);

    // Cihaz A satar; cihaz B (çevrimdışı, aynı son stoğu görüyordu) satar
    await recordMovement(ctxA, { productId: product.id, type: "SALE_OUT", quantity: -1, note: "A satışı" });
    const movementsA = await db.stock_movements.toArray();
    await db.sync_queue.clear();
    const deviceB = { ...ctxA, deviceCode: "DEMO-BBBB" };
    await db.stock_movements.clear();
    await db.stock_movements.bulkAdd(movementsA.filter((m) => m.movement_type !== "SALE_OUT")); // B'nin bildiği durum: 1 adet var
    await recordMovement(deviceB, { productId: product.id, type: "SALE_OUT", quantity: -1, note: "B satışı" });
    await push(server);

    // Cihaz A'nın satışı da sunucuya gider (kuyruğu yeniden kur)
    const aSale = movementsA.find((m) => m.movement_type === "SALE_OUT")!;
    await enqueue("stock_movements", aSale.id, "INSERT", { ...aSale } as never, "DEMO-AAAA");
    await push(server);
    expect(server.tables.stock_movements.filter((m) => m.movement_type === "SALE_OUT")).toHaveLength(2);

    // Eşitlenen cihazın yerel verisi: tüm hareketler çekildi
    await db.stock_movements.clear();
    await db.stock_movements.bulkAdd(server.tables.stock_movements as never[]);
    expect((await getProductBalance(product.id)).available).toBe(-1);

    expect(await syncStockNotifications({ businessId: B, deviceCode: "DEMO-AAAA" })).toBeGreaterThanOrEqual(1);
    const conflict = (await db.notifications.toArray()).find((n) => n.dedupe_key.startsWith("NEGATIVE_STOCK:"));
    expect(conflict?.message).toMatch(/eksiye düştü/);
    expect(conflict?.message).toMatch(/stok düzeltmesi|işlemi iptal/i);
  });
});

describe("aynı paket tekrar gönderilir (AC-036, TC-037)", () => {
  it("sunucuda tek kayıt olur ve ikinci gönderim de başarılı sayılır", async () => {
    const server = fakeServer();
    const product = await createProduct(ctxA, { name: "Zincir", unit: "ADET", is_serial_tracked: false, default_sale_price: 50, default_tax_mode: "NONE", default_tax_rate: 0 });
    await push(server);
    const item = (await db.sync_queue.toArray())[0];
    const again = await applyPushItem({ supabase: server.supabase, businessId: B }, { id: item.id, table_name: item.table_name as never, record_id: item.record_id, operation: item.operation, payload: item.payload });
    expect(again.success).toBe(true);
    expect(server.tables.products).toHaveLength(1);
    expect(server.tables.products[0].id).toBe(product.id);
  });
});

describe("eşitleme hatası kaydı silmez (AC-037, TC-038) ve hesaplanan toplam uyuşmazlığı sessizce kabul edilmez (AC-026, TC-051)", () => {
  it("sunucunun reddettiği satır kuyrukta kalır, deneme sayısı artar, 5. denemede ERROR olur", async () => {
    const server = fakeServer();
    await enqueue("sale_items", "i1", "INSERT", {
      id: "i1", business_id: B, sale_id: "s1", unit_price_snapshot: 100, quantity: 2, discount_amount: 0, tax_mode: "NONE", tax_rate: 0,
      line_total: 150, // 200 olmalı
    }, "DEMO-AAAA");

    for (let attempt = 1; attempt <= 5; attempt++) {
      const [result] = await push(server);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/hesaplanandan farklı/);
      const item = (await db.sync_queue.toArray())[0];
      expect(item.retry_count).toBe(attempt);
    }
    const final = (await db.sync_queue.toArray())[0];
    expect(final.status).toBe("ERROR");
    expect(final.error_message).toMatch(/farklı/);
    expect(server.tables.sale_items ?? []).toHaveLength(0); // sunucuya hiçbir şey yazılmadı
  });
});
