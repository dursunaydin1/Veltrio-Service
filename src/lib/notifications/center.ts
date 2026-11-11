import { db, type NotificationMark } from "@/lib/db";
import { nowISO } from "@/lib/utils";
import type { Notification, SyncQueueItem } from "@/types";
import { reconcileNotifications, type NotificationContext, type PlannedNotification } from "./core";

/**
 * Bildirim merkezi işlemleri (Adım 6.6-6.7, FR-022): okundu / çözüldü işaretleme ve eşitleme
 * sorunu bildirimi. Okundu ve elle "çözüldü say" kişiye özeldir (K-122): bu cihazda tutulur,
 * sunucuya gitmez; çalışanın okuması patronun zilini etkilemez. Koşul ortadan kalkınca sistemin
 * çözdüğü bildirim (`resolved_at`) ise herkes için çözülür. K-122'den önce ortak yazılmış
 * `read_at` / `resolved_at` olduğu gibi geçerlidir.
 */

const markId = (userId: string, notificationId: string) => `${userId}:${notificationId}`;

export type Marks = Map<string, NotificationMark>;

/** Kişinin işaretleri, bildirim kimliğine göre */
export async function loadMarks(userId: string): Promise<Marks> {
  const rows = await db.notification_marks.where("user_id").equals(userId).toArray();
  return new Map(rows.map((m) => [m.notification_id, m]));
}

export function isResolved(n: Pick<Notification, "id" | "resolved_at">, marks: Marks): boolean {
  return !!(n.resolved_at || marks.get(n.id)?.resolved_at);
}

export function isRead(n: Pick<Notification, "id" | "read_at" | "resolved_at">, marks: Marks): boolean {
  return !!(n.read_at || marks.get(n.id)?.read_at) || isResolved(n, marks);
}

async function mark(userId: string, notificationId: string, resolve: boolean): Promise<void> {
  const id = markId(userId, notificationId);
  const existing = await db.notification_marks.get(id);
  if (resolve ? existing?.resolved_at : existing?.read_at) return;
  const now = nowISO();
  await db.notification_marks.put({
    ...existing,
    id,
    user_id: userId,
    notification_id: notificationId,
    read_at: existing?.read_at ?? now,
    resolved_at: resolve ? now : existing?.resolved_at,
  });
}

export function markRead(userId: string, id: string): Promise<void> {
  return mark(userId, id, false);
}

/** Elle çözüldü işaretleme (ör. kullanıcı konuyu başka yolla çözdü). */
export function markResolved(userId: string, id: string): Promise<void> {
  return mark(userId, id, true);
}

/** Çalışan bildirimi patronundur; çalışanın cihazına inse de ona gösterilmez (K-121). */
export function visibleTo(owner: boolean) {
  return (n: Pick<Notification, "type">) => owner || n.type !== "STAFF_ACTIVITY";
}

async function unreadOf(userId: string, businessId: string, owner: boolean): Promise<Notification[]> {
  const [marks, all] = await Promise.all([loadMarks(userId), db.notifications.where("business_id").equals(businessId).toArray()]);
  const visible = visibleTo(owner);
  return all.filter((n) => visible(n) && !isRead(n, marks));
}

export async function markAllRead(userId: string, businessId: string, owner = true): Promise<number> {
  const unread = await unreadOf(userId, businessId, owner);
  for (const n of unread) await markRead(userId, n.id);
  return unread.length;
}

export async function unreadCount(userId: string, businessId: string, owner = true): Promise<number> {
  return (await unreadOf(userId, businessId, owner)).length;
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
