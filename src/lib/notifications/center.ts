import { db } from "@/lib/db";
import { enqueue } from "@/lib/sync/queue";
import { nowISO } from "@/lib/utils";
import type { Notification, SyncQueueItem } from "@/types";
import { reconcileNotifications, type NotificationContext, type PlannedNotification } from "./core";

/**
 * Bildirim merkezi işlemleri (Adım 6.6-6.7, FR-022): okundu / çözüldü işaretleme
 * (sunucuya eşitlenir; çevrimdışı işaret kuyrukta bekler) ve eşitleme sorunu bildirimi.
 */

type Versioned = Notification & { version?: number };

function payload(n: Versioned, readAt: string | undefined, resolvedAt: string | undefined) {
  return {
    id: n.id,
    business_id: n.business_id,
    read_at: readAt ?? null,
    resolved_at: resolvedAt ?? null,
    version: n.version ?? 1,
  };
}

export async function markRead(deviceCode: string, id: string): Promise<void> {
  await db.transaction("rw", db.notifications, db.sync_queue, async () => {
    const n = (await db.notifications.get(id)) as Versioned | undefined;
    if (!n || n.read_at) return;
    const now = nowISO();
    await db.notifications.put({ ...n, read_at: now });
    await enqueue("notifications", id, "UPDATE", payload(n, now, n.resolved_at), deviceCode);
  });
}

export async function markAllRead(deviceCode: string, businessId: string): Promise<number> {
  const unread = await db.notifications.where("business_id").equals(businessId).filter((n) => !n.read_at).toArray();
  for (const n of unread) await markRead(deviceCode, n.id);
  return unread.length;
}

/** Elle çözüldü işaretleme (ör. kullanıcı konuyu başka yolla çözdü). */
export async function markResolved(deviceCode: string, id: string): Promise<void> {
  await db.transaction("rw", db.notifications, db.sync_queue, async () => {
    const n = (await db.notifications.get(id)) as Versioned | undefined;
    if (!n || n.resolved_at) return;
    const now = nowISO();
    const readAt = n.read_at ?? now;
    await db.notifications.put({ ...n, read_at: readAt, resolved_at: now });
    await enqueue("notifications", id, "UPDATE", payload(n, readAt, now), deviceCode);
  });
}

export async function unreadCount(businessId: string): Promise<number> {
  return db.notifications.where("business_id").equals(businessId).filter((n) => !n.read_at && !n.resolved_at).count();
}

const ISSUE_STATUSES: SyncQueueItem["status"][] = ["ERROR", "CONFLICT"];

/**
 * Bu cihazda eşitlenemeyen veya çakışan her kayıt için bir bildirim (cihaz başına,
 * `SYNC_ISSUE:{cihaz}:{kuyruk kaydı}`); kayıt çözülünce / gönderilince bildirim çözülür.
 */
export async function syncIssueNotifications(ctx: NotificationContext): Promise<number> {
  const items = (await db.sync_queue.toArray()).filter(
    (i) => i.device_code === ctx.deviceCode && ISSUE_STATUSES.includes(i.status) && (i.payload as Record<string, unknown>).business_id === ctx.businessId
  );
  const planned: PlannedNotification[] = items.map((i) => ({
    type: "SYNC_CONFLICT",
    dedupeKey: `SYNC_ISSUE:${ctx.deviceCode}:${i.id}`,
    relatedId: i.record_id,
    message:
      i.status === "CONFLICT"
        ? `Eşitleme çakışması (${i.table_name}): kayıt başka cihazda değişmiş. Merkezde çözün.`
        : `Eşitlenemeyen kayıt (${i.table_name}): ${i.error_message ?? "bilinmeyen hata"}`,
  }));
  const active = new Set(planned.map((p) => p.dedupeKey));
  return reconcileNotifications(
    ctx,
    "SYNC_CONFLICT",
    planned,
    (n) => n.dedupeKey.startsWith(`SYNC_ISSUE:${ctx.deviceCode}:`) && !active.has(n.dedupeKey)
  );
}
