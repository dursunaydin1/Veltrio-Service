import { db } from "@/lib/db";
import { getSaleBalance } from "@/lib/sales/service";
import { getServiceBalance } from "@/lib/services/service";
import { daysOverdue } from "@/lib/finance/aging";
import { formatCurrency, todayLocalDate } from "@/lib/utils";
import { reconcileNotifications } from "./core";
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
  const planned = planDueReminders(candidates, today).map((p) => ({ ...p, type: "PAYMENT_DUE" as const }));
  const settled = new Set(candidates.filter((c) => c.remainingKurus <= 0).map((c) => c.id));
  return reconcileNotifications(ctx, "PAYMENT_DUE", planned, (n) => settled.has(n.relatedId));
}
