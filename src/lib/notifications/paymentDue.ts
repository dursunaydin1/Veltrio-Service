import { v5 as uuidv5 } from "uuid";
import { db } from "@/lib/db";
import { getSaleBalance } from "@/lib/sales/service";
import { getServiceBalance } from "@/lib/services/service";
import { daysOverdue } from "@/lib/finance/aging";
import { enqueue } from "@/lib/sync/queue";
import { formatCurrency, nowISO, todayLocalDate } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";

/**
 * Vade hatırlatmaları (PRD §9.4, AC-038): vade yalnızca girildiyse hatırlatma
 * oluşur; vade gününde bir kez, gecikme 7 günü aşınca bir kez daha. Aynı olay
 * tekrar üretilmez (dedupe_key), ödeme tamamlanınca bildirim çözülür.
 */

export type DueCandidate = {
  kind: "SALE" | "SERVICE";
  id: string;
  label: string;
  customerName: string;
  dueDate: string;
  remainingKurus: number;
};

export type PlannedReminder = {
  dedupeKey: string;
  relatedId: string;
  message: string;
};

const money = (kurus: number) => formatCurrency(kurus / 100);

/** Bugüne göre üretilmesi gereken hatırlatmalar (saf fonksiyon). */
export function planDueReminders(candidates: DueCandidate[], today: string): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const c of candidates) {
    if (c.remainingKurus <= 0) continue;
    const days = daysOverdue(c.dueDate, today);
    const base = `PAYMENT_DUE:${c.kind}:${c.id}`;
    if (days >= 0) {
      out.push({
        dedupeKey: `${base}:DUE`,
        relatedId: c.id,
        message: `Vade günü: ${c.customerName} — ${c.label}, kalan ${money(c.remainingKurus)}`,
      });
    }
    if (days > 7) {
      out.push({
        dedupeKey: `${base}:OVERDUE7`,
        relatedId: c.id,
        message: `${days} gün gecikti: ${c.customerName} — ${c.label}, kalan ${money(c.remainingKurus)}`,
      });
    }
  }
  return out;
}

/** Aynı olayı her cihaz aynı kimlikle üretir; sunucudaki UNIQUE (işletme, dedupe_key) çakışmaz. */
const NOTIFICATION_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const notificationId = (businessId: string, dedupeKey: string) =>
  uuidv5(`${businessId}:${dedupeKey}`, NOTIFICATION_NAMESPACE);

async function loadCandidates(businessId: string): Promise<DueCandidate[]> {
  const [sales, services, customers] = await Promise.all([
    db.sales.where("business_id").equals(businessId).filter((s) => s.status === "FINAL" && !!s.due_date).toArray(),
    db.services
      .where("business_id")
      .equals(businessId)
      .filter((s) => s.status === "DELIVERED" && !!s.due_date)
      .toArray(),
    db.customers.where("business_id").equals(businessId).toArray(),
  ]);
  const names = new Map(customers.map((c) => [c.id, c.name]));
  const out: DueCandidate[] = [];
  for (const s of sales) {
    out.push({
      kind: "SALE", id: s.id, label: s.document_no, dueDate: s.due_date as string,
      customerName: names.get(s.customer_id ?? "") ?? "Müşteri",
      remainingKurus: (await getSaleBalance(s.id)).remaining,
    });
  }
  for (const s of services) {
    out.push({
      kind: "SERVICE", id: s.id, label: s.document_no, dueDate: s.due_date as string,
      customerName: names.get(s.customer_id ?? "") ?? "Müşteri",
      remainingKurus: (await getServiceBalance(s.id)).remaining,
    });
  }
  return out;
}

/**
 * Bildirimleri günceller: eksik hatırlatmaları üretir, tamamen ödenmiş
 * belgelerin açık bildirimlerini çözer. Üretilen yeni bildirim sayısını döner.
 */
export async function syncPaymentDueNotifications(
  ctx: Pick<BusinessContext, "businessId" | "deviceCode">,
  today: string = todayLocalDate()
): Promise<number> {
  const candidates = await loadCandidates(ctx.businessId);
  const planned = planDueReminders(candidates, today);

  return db.transaction("rw", db.notifications, db.sync_queue, async () => {
    let created = 0;
    const now = nowISO();
    for (const p of planned) {
      const id = notificationId(ctx.businessId, p.dedupeKey);
      if (await db.notifications.get(id)) continue;
      const row = {
        id,
        business_id: ctx.businessId,
        type: "PAYMENT_DUE" as const,
        related_record_id: p.relatedId,
        message: p.message,
        dedupe_key: p.dedupeKey,
        created_at: now,
      };
      await db.notifications.add(row);
      await enqueue(
        "notifications",
        id,
        "INSERT",
        { ...row, read_at: null, resolved_at: null },
        ctx.deviceCode
      );
      created++;
    }

    // Ödemesi tamamlanan belgelerin açık vade bildirimlerini çöz.
    const settled = new Set(candidates.filter((c) => c.remainingKurus <= 0).map((c) => c.id));
    const open = await db.notifications
      .where("business_id")
      .equals(ctx.businessId)
      .filter((n) => n.type === "PAYMENT_DUE" && !n.resolved_at && !!n.related_record_id && settled.has(n.related_record_id))
      .toArray();
    for (const n of open) {
      const next = { ...n, resolved_at: now };
      await db.notifications.put(next);
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
