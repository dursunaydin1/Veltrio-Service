import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { reconcileNotifications } from "./core";
import { markAllRead, markRead, markResolved, syncIssueNotifications, unreadCount } from "./center";
import { ConflictResolveError, resolveKeepMine, resolveKeepServer, retryItem } from "@/lib/sync/conflicts";

const B = "00000000-0000-0000-0000-000000000001";
const ctx = { businessId: B, deviceCode: "DEMO-AB23" };

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
});

const make = (key: string) =>
  reconcileNotifications(ctx, "LOW_STOCK", [{ type: "LOW_STOCK", dedupeKey: key, relatedId: "r1", message: "m" }], () => false);

describe("bildirim merkezi (FR-022)", () => {
  it("okundu / çözüldü işareti yerel kaydı günceller ve sürümle kuyruğa yazılır", async () => {
    await make("LOW_STOCK:p1:1");
    await db.sync_queue.clear();
    const [n] = await db.notifications.toArray();
    expect(await unreadCount(B)).toBe(1);

    await markRead(ctx.deviceCode, n.id);
    expect(await unreadCount(B)).toBe(0);
    const q = await db.sync_queue.toArray();
    expect(q[0]).toMatchObject({ table_name: "notifications", operation: "UPDATE" });
    expect(q[0].payload).toMatchObject({ id: n.id, version: 1 });
    expect(q[0].payload.read_at).toBeTruthy();

    await markResolved(ctx.deviceCode, n.id);
    const after = (await db.notifications.get(n.id))!;
    expect(after.resolved_at).toBeTruthy();
    // aynı işareti ikinci kez kuyruğa yazmaz
    const count = await db.sync_queue.count();
    await markResolved(ctx.deviceCode, n.id);
    await markRead(ctx.deviceCode, n.id);
    expect(await db.sync_queue.count()).toBe(count);
  });

  it("tümünü okundu yapar", async () => {
    await make("LOW_STOCK:a:1");
    await make("LOW_STOCK:b:1");
    expect(await markAllRead(ctx.deviceCode, B)).toBe(2);
    expect(await unreadCount(B)).toBe(0);
  });
});

describe("eşitleme sorunu bildirimi (6.6)", () => {
  const issue = (id: string, status: "ERROR" | "CONFLICT", device = ctx.deviceCode) =>
    db.sync_queue.add({
      id, table_name: "customers", record_id: `rec-${id}`, operation: "UPDATE",
      payload: { id: `rec-${id}`, business_id: B }, device_code: device, status, retry_count: 5,
      error_message: "hata", created_at: "2026-01-01T00:00:00Z",
    });

  it("hatalı ve çakışan kayıt için cihaz başına bir bildirim; kayıt çözülünce bildirim çözülür", async () => {
    await issue("q1", "ERROR");
    await issue("q2", "CONFLICT");
    await issue("q3", "ERROR", "DEMO-OTHER"); // başka cihazın sorunu bu cihazda üretilmez
    expect(await syncIssueNotifications(ctx)).toBe(2);
    expect(await syncIssueNotifications(ctx)).toBe(0);
    const msgs = (await db.notifications.toArray()).map((n) => n.message).sort();
    expect(msgs[0]).toMatch(/çakışması|Eşitlenemeyen/);

    await db.sync_queue.update("q1", { status: "SYNCED" });
    await syncIssueNotifications(ctx);
    const open = (await db.notifications.toArray()).filter((n) => !n.resolved_at);
    expect(open).toHaveLength(1);
    expect(open[0].dedupe_key).toBe("SYNC_ISSUE:DEMO-AB23:q2");
  });
});

/** Çakışma çözümü için minimal Supabase taklidi. */
const fakeServer = (row: Record<string, unknown> | null) =>
  ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }) }),
  }) as unknown as SupabaseClient;

describe("çakışma çözümü (AC-026)", () => {
  const conflict = async () => {
    await db.customers.add({ id: "c1", business_id: B, name: "Yerel ad", version: 1, created_at: "x", updated_at: "x" } as never);
    await db.sync_queue.add({
      id: "q1", table_name: "customers", record_id: "c1", operation: "UPDATE",
      payload: { id: "c1", business_id: B, name: "Yerel ad", version: 1 }, device_code: ctx.deviceCode,
      status: "CONFLICT", retry_count: 0, error_message: "sürüm farkı", created_at: "x",
    });
  };

  it("sunucudaki sürümü al: yerel değişiklik atılır, kayıt sunucudaki hâline gelir", async () => {
    await conflict();
    await resolveKeepServer(fakeServer({ id: "c1", business_id: B, name: "Sunucu adı", version: 3 }), "q1");
    expect(await db.customers.get("c1")).toMatchObject({ name: "Sunucu adı", version: 3 });
    expect(await db.sync_queue.get("q1")).toBeUndefined();
  });

  it("benim değişikliğimi uygula: sunucudaki güncel sürümle yeniden gönderilmek üzere PENDING olur", async () => {
    await conflict();
    await resolveKeepMine(fakeServer({ version: 4 }), "q1");
    const item = (await db.sync_queue.get("q1"))!;
    expect(item).toMatchObject({ status: "PENDING", retry_count: 0 });
    expect(item.payload).toMatchObject({ name: "Yerel ad", version: 4 });
  });

  it("sunucuda silinmiş kayıtta 'benimkini uygula' reddedilir, 'sunucuyu al' yerelden de siler", async () => {
    await conflict();
    await expect(resolveKeepMine(fakeServer(null), "q1")).rejects.toBeInstanceOf(ConflictResolveError);
    await resolveKeepServer(fakeServer(null), "q1");
    expect(await db.customers.get("c1")).toBeUndefined();
  });

  it("hatalı kayıt yeniden denenir", async () => {
    await conflict();
    await db.sync_queue.update("q1", { status: "ERROR", retry_count: 5 });
    await retryItem("q1");
    expect(await db.sync_queue.get("q1")).toMatchObject({ status: "PENDING", retry_count: 0 });
  });
});
