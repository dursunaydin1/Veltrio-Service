import { v5 as uuidv5 } from "uuid";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/sync/queue";
import { nowISO } from "@/lib/utils";
import type { NotificationType } from "@/types";

/**
 * Bildirim üretimi için ortak çekirdek (PRD §14, AC-038). Aynı olay tekrar
 * üretilmez (dedupe_key); koşul ortadan kalkınca bildirim çözülür.
 */

export type PlannedNotification = {
  type: NotificationType;
  dedupeKey: string;
  relatedId: string;
  message: string;
};

export type NotificationContext = { businessId: string; deviceCode: string };

/**
 * Aynı olayı her cihaz aynı kimlikle üretir; sunucudaki UNIQUE (işletme,
 * dedupe_key) kısıtı iki cihaz aynı bildirimi üretince çakışmaz.
 */
const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
export const notificationId = (businessId: string, dedupeKey: string) => uuidv5(`${businessId}:${dedupeKey}`, NAMESPACE);

/**
 * Planlanan bildirimlerden eksik olanları üretir; `shouldResolve` true dönen
 * açık bildirimleri çözer. `type` yalnızca o türün bildirimlerine dokunur.
 * Yeni üretilen bildirim sayısını döner.
 */
export async function reconcileNotifications(
  ctx: NotificationContext,
  type: NotificationType,
  planned: PlannedNotification[],
  shouldResolve: (n: { relatedId: string; dedupeKey: string }) => boolean
): Promise<number> {
  return db.transaction("rw", db.notifications, db.sync_queue, async () => {
    const now = nowISO();
    let created = 0;
    for (const p of planned) {
      const id = notificationId(ctx.businessId, p.dedupeKey);
      if (await db.notifications.get(id)) continue;
      const row = {
        id,
        business_id: ctx.businessId,
        type: p.type,
        related_record_id: p.relatedId,
        message: p.message,
        dedupe_key: p.dedupeKey,
        created_at: now,
      };
      await db.notifications.add(row);
      await enqueue("notifications", id, "INSERT", { ...row, read_at: null, resolved_at: null }, ctx.deviceCode);
      created++;
    }

    const open = await db.notifications
      .where("business_id")
      .equals(ctx.businessId)
      .filter((n) => n.type === type && !n.resolved_at)
      .toArray();
    for (const n of open) {
      if (!shouldResolve({ relatedId: n.related_record_id ?? "", dedupeKey: n.dedupe_key })) continue;
      await db.notifications.put({ ...n, resolved_at: now });
      await enqueue(
        "notifications",
        n.id,
        "UPDATE",
        {
          id: n.id,
          business_id: n.business_id,
          read_at: n.read_at ?? null,
          resolved_at: now,
          version: (n as { version?: number }).version ?? 1,
        },
        ctx.deviceCode
      );
    }
    return created;
  });
}
