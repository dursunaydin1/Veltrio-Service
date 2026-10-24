import { db } from "@/lib/db";
import { daysOverdue } from "@/lib/finance/aging";
import { todayLocalDate } from "@/lib/utils";
import { reconcileNotifications, type NotificationContext, type PlannedNotification } from "./core";

/**
 * Servis bildirimleri (PRD §14; SR-014, SR-019, AC-038): teslim tarihi hatırlatması,
 * parça bekleniyor, müşteri onayı bekleniyor, iş tamamlandı. Her tür kendi
 * `dedupe_key`'iyle tekrarsız üretilir; koşul bitince çözülür.
 */

export const CLOSED_STATUSES = ["DELIVERED", "CANCELLED"];
export const DEFAULT_REMINDER_DAYS = 1;

export type ServiceFacts = {
  id: string;
  documentNo: string;
  customerName: string;
  status: string;
  promisedDate?: string;
  firstCompleted: boolean;
  /** Sipariş edilecek / sipariş verilmiş (henüz gelmemiş) parçası var mı */
  waitingParts: boolean;
};

export type PlannedService = PlannedNotification & { serviceId: string };

/** Bugüne göre üretilmesi gereken servis bildirimleri (saf fonksiyon). */
export function planServiceNotifications(
  services: ServiceFacts[],
  today: string,
  reminderDays: number = DEFAULT_REMINDER_DAYS
): PlannedService[] {
  const out: PlannedService[] = [];
  for (const s of services) {
    if (CLOSED_STATUSES.includes(s.status)) continue;
    const who = `${s.documentNo} — ${s.customerName}`;
    const add = (type: PlannedNotification["type"], key: string, message: string) =>
      out.push({ type, dedupeKey: key, relatedId: s.id, message, serviceId: s.id });

    if (s.promisedDate) {
      const days = daysOverdue(s.promisedDate, today);
      if (days > 0) {
        add("DELIVERY_REMINDER", `DELIVERY_REMINDER:${s.id}:OVERDUE:${today}`, `Teslim tarihi ${days} gün geçti: ${who}`);
      } else if (days >= -reminderDays) {
        add(
          "DELIVERY_REMINDER",
          `DELIVERY_REMINDER:${s.id}:UPCOMING`,
          days === 0 ? `Teslim tarihi bugün: ${who}` : `Teslim tarihi yaklaşıyor (${-days} gün): ${who}`
        );
      }
    }
    if (s.waitingParts) add("PART_WAITING", `PART_WAITING:${s.id}`, `Parça bekleniyor: ${who}`);
    if (s.status === "WAITING_CUSTOMER_APPROVAL") {
      add("CUSTOMER_APPROVAL_NEEDED", `CUSTOMER_APPROVAL_NEEDED:${s.id}`, `Müşteri onayı bekleniyor: ${who}`);
    }
    if (s.firstCompleted && s.status === "COMPLETED") {
      add("SERVICE_COMPLETED", `SERVICE_COMPLETED:${s.id}`, `İş tamamlandı, teslim bekliyor: ${who}`);
    }
  }
  return out;
}

export async function loadServiceFacts(businessId: string): Promise<ServiceFacts[]> {
  const [services, customers, parts] = await Promise.all([
    db.services.where("business_id").equals(businessId).toArray(),
    db.customers.where("business_id").equals(businessId).toArray(),
    db.service_parts.where("business_id").equals(businessId).toArray(),
  ]);
  const names = new Map(customers.map((c) => [c.id, c.name]));
  const waiting = new Set(
    parts
      .filter(
        (p) =>
          (p.supply_status === "TO_ORDER" || p.supply_status === "ORDERED") &&
          p.status !== "REJECTED" &&
          p.status !== "DEFERRED"
      )
      .map((p) => p.service_id)
  );
  return services.map((s) => ({
    id: s.id,
    documentNo: s.document_no,
    customerName: names.get(s.customer_id ?? "") ?? "Müşteri",
    status: s.status,
    promisedDate: s.promised_date ?? undefined,
    firstCompleted: !!s.first_completed_at,
    waitingParts: waiting.has(s.id),
  }));
}

/**
 * Servis bildirimlerini günceller; yeni üretilen bildirim sayısını döner.
 * Tür başına: planda olmayan açık bildirim çözülür (ör. servis teslim edildi,
 * parçalar geldi); gecikme bildirimi her gün yenisiyle değişir.
 */
export async function syncServiceNotifications(
  ctx: NotificationContext,
  options: { today?: string; reminderDays?: number } = {}
): Promise<number> {
  const today = options.today ?? todayLocalDate();
  const facts = await loadServiceFacts(ctx.businessId);
  const planned = planServiceNotifications(facts, today, options.reminderDays);

  let created = 0;
  for (const type of ["DELIVERY_REMINDER", "PART_WAITING", "CUSTOMER_APPROVAL_NEEDED", "SERVICE_COMPLETED"] as const) {
    const ofType = planned.filter((p) => p.type === type);
    const active = new Set(ofType.map((p) => p.dedupeKey));
    const activeServices = new Set(ofType.map((p) => p.serviceId));
    created += await reconcileNotifications(ctx, type, ofType, (n) => {
      // Teslim: yalnızca güncel anahtarlar açık kalır (gecikme bildirimi her gün yenilenir, yaklaşan gecikince kapanır).
      if (type === "DELIVERY_REMINDER") return !active.has(n.dedupeKey);
      return !activeServices.has(n.relatedId);
    });
  }
  return created;
}

/** Ana ekran sayıları (3.17): canlı veriden, bildirimden bağımsız. */
export function summarizeServices(services: ServiceFacts[], today: string, reminderDays: number = DEFAULT_REMINDER_DAYS) {
  const open = services.filter((s) => !CLOSED_STATUSES.includes(s.status));
  let upcoming = 0;
  let overdue = 0;
  for (const s of open) {
    if (!s.promisedDate) continue;
    const days = daysOverdue(s.promisedDate, today);
    if (days > 0) overdue++;
    else if (days >= -reminderDays) upcoming++;
  }
  return {
    active: open.length,
    waitingApproval: open.filter((s) => s.status === "WAITING_CUSTOMER_APPROVAL").length,
    waitingParts: open.filter((s) => s.waitingParts || s.status === "WAITING_PARTS").length,
    upcoming,
    overdue,
  };
}
