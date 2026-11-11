import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import type { ActorNames, TeamDevices } from "@/lib/auth/actors";
import { reconcileNotifications, type NotificationContext, type PlannedNotification } from "./core";

/**
 * Çalışanın yaptıkları (K-121): patron, çalışanın eklediği müşteriyi, açtığı / kapattığı servisi,
 * yaptığı satışı ve aldığı tahsilatı bildirimde ve çalışan kartındaki "Yaptıkları" listesinde görür.
 * Ayrı bir kayıt tutulmaz; bilgi zaten cihaz koduyla imzalı kayıtlardan okunur.
 */

export type ActivityKind = "CUSTOMER" | "SERVICE_OPENED" | "SERVICE_COMPLETED" | "SERVICE_DELIVERED" | "SERVICE_CANCELLED" | "SALE" | "PAYMENT";

export type ActivityItem = {
  /** Olayın kalıcı anahtarı: aynı olay iki kez bildirilmez */
  key: string;
  kind: ActivityKind;
  at: string;
  device: string;
  /** "satış yaptı: 2.450 ₺ · Ali Kaya" (kişi adı olmadan) */
  text: string;
  /** Dokununca açılacak kayıt */
  href: string | null;
  relatedId: string;
};

const STATUS_KIND: Partial<Record<string, ActivityKind>> = {
  COMPLETED: "SERVICE_COMPLETED",
  DELIVERED: "SERVICE_DELIVERED",
  CANCELLED: "SERVICE_CANCELLED",
};

const STATUS_TEXT: Partial<Record<ActivityKind, string>> = {
  SERVICE_COMPLETED: "servisin işini tamamladı",
  SERVICE_DELIVERED: "servisi teslim etti",
  SERVICE_CANCELLED: "servisi iptal etti",
};

const withParty = (text: string, party: string | undefined) => (party ? `${text} · ${party}` : text);

/** Verilen cihazların `since` sonrasındaki işleri, yeniden eskiye. */
export async function loadActivity(businessId: string, devices: ReadonlySet<string>, since = ""): Promise<ActivityItem[]> {
  if (devices.size === 0) return [];
  const mine = (device: string | undefined, at: string | undefined) => !!device && devices.has(device) && !!at && at > since;
  const [customers, services, history, sales, payments] = await Promise.all([
    db.customers.where("business_id").equals(businessId).toArray(),
    db.services.where("business_id").equals(businessId).toArray(),
    db.service_status_history.where("business_id").equals(businessId).filter((h) => mine(h.changed_by_device, h.changed_at)).toArray(),
    db.sales.where("business_id").equals(businessId).filter((s) => s.status !== "DRAFT" && mine(s.created_by_device, s.finalized_at ?? s.created_at)).toArray(),
    db.payments
      .where("business_id")
      .equals(businessId)
      // Satışın tahsilatı satış satırında görünür; ayrıca yazılmaz
      .filter((p) => p.direction === "IN" && p.status === "VALID" && p.source_type !== "SALE" && mine(p.created_by_device, p.created_at))
      .toArray(),
  ]);
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const items: ActivityItem[] = [];

  for (const c of customers) {
    if (!mine(c.created_by_device, c.created_at)) continue;
    items.push({ key: `CUSTOMER:${c.id}`, kind: "CUSTOMER", at: c.created_at, device: c.created_by_device!, text: `yeni müşteri ekledi: ${c.name}`, href: `/customers/${c.id}`, relatedId: c.id });
  }
  for (const s of services) {
    if (!mine(s.created_by_device, s.created_at)) continue;
    items.push({
      key: `SERVICE_OPENED:${s.id}`,
      kind: "SERVICE_OPENED",
      at: s.created_at,
      device: s.created_by_device,
      text: withParty(`servis açtı: ${s.document_no}`, s.customer_id ? customerName.get(s.customer_id) : undefined),
      href: `/services/${s.id}`,
      relatedId: s.id,
    });
  }
  for (const h of history) {
    const kind = STATUS_KIND[h.to_status];
    const service = serviceById.get(h.service_id);
    if (!kind || !service) continue;
    items.push({
      key: `${kind}:${h.id}`,
      kind,
      at: h.changed_at,
      device: h.changed_by_device,
      text: withParty(`${STATUS_TEXT[kind]}: ${service.document_no}`, service.customer_id ? customerName.get(service.customer_id) : undefined),
      href: `/services/${service.id}`,
      relatedId: service.id,
    });
  }
  for (const s of sales) {
    items.push({
      key: `SALE:${s.id}`,
      kind: "SALE",
      at: s.finalized_at ?? s.created_at,
      device: s.created_by_device,
      text: withParty(`satış yaptı: ${formatCurrency(s.total_amount)}`, s.customer_id ? customerName.get(s.customer_id) : undefined),
      href: `/sales/${s.id}`,
      relatedId: s.id,
    });
  }
  for (const p of payments) {
    items.push({
      key: `PAYMENT:${p.id}`,
      kind: "PAYMENT",
      at: p.created_at,
      device: p.created_by_device,
      text: withParty(`tahsilat aldı: ${formatCurrency(p.amount)}`, p.customer_id ? customerName.get(p.customer_id) : undefined),
      href: p.customer_id ? `/customers/${p.customer_id}` : null,
      relatedId: p.customer_id ?? p.id,
    });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** Başka kullanıcıların cihazları ve adları: patronun kendi cihazları bildirim üretmez. */
export function otherPeoplesDevices(names: ActorNames, devices: TeamDevices, myUserId: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [device, userId] of Object.entries(devices)) {
    if (userId !== myUserId) result.set(device, names[device] ?? "Çalışan");
  }
  return result;
}

const STAFF_PREFIX = "STAFF:";

/** Bildirime dokununca açılacak kayıt; anahtar `STAFF:{tür}:{kimlik}` */
export function staffActivityHref(dedupeKey: string, relatedId: string | undefined): string | null {
  if (!relatedId || !dedupeKey.startsWith(STAFF_PREFIX)) return null;
  const kind = dedupeKey.slice(STAFF_PREFIX.length).split(":")[0];
  if (kind === "CUSTOMER" || kind === "PAYMENT") return `/customers/${relatedId}`;
  if (kind === "SALE") return `/sales/${relatedId}`;
  return kind.startsWith("SERVICE") ? `/services/${relatedId}` : null;
}

const sinceKey = (ctx: NotificationContext) => `veltrio_staff_activity_since:${ctx.businessId}:${ctx.deviceCode}`;

/**
 * Bu cihazın çalışan bildirimi ürettiği başlangıç anı. İlk çalışmada "şimdi" yazılır; böylece
 * yeni cihazda ya da ilk kurulumda geçmişteki her iş bildirim olarak yağmaz (geçmiş, çalışanın
 * "Yaptıkları" listesinde durur). Sonradan inen eski tarihli kayıt da bu andan yeniyse bildirilir.
 */
function activitySince(ctx: NotificationContext, now: string): string | null {
  try {
    const stored = window.localStorage.getItem(sinceKey(ctx));
    if (stored) return stored;
    window.localStorage.setItem(sinceKey(ctx), now);
    return now;
  } catch {
    return null;
  }
}

/** Patron cihazında: çalışanın yeni işleri için bildirim üretir. Yeni bildirim sayısını döner. */
export async function syncStaffActivityNotifications(ctx: NotificationContext, staff: ReadonlyMap<string, string>, now: string): Promise<number> {
  const since = activitySince(ctx, now);
  if (!since || staff.size === 0) return 0;
  const items = await loadActivity(ctx.businessId, new Set(staff.keys()), since);
  const planned: PlannedNotification[] = items.map((item) => ({
    type: "STAFF_ACTIVITY",
    dedupeKey: `${STAFF_PREFIX}${item.key}`,
    relatedId: item.relatedId,
    message: `${staff.get(item.device)} ${item.text}`,
  }));
  return reconcileNotifications(ctx, "STAFF_ACTIVITY", planned, () => false);
}
