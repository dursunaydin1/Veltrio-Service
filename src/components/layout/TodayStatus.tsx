"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { AlarmClock, CalendarClock, CircleDollarSign, ClipboardCheck, PackageOpen, PackageX, Wrench, type LucideIcon } from "lucide-react";
import { db } from "@/lib/db";
import { isLow, loadStockFacts } from "@/lib/notifications/stockAlerts";
import { loadServiceFacts, summarizeServices } from "@/lib/notifications/serviceReminders";
import { useSessionStore } from "@/stores/session";
import { todayLocalDate } from "@/lib/utils";

/**
 * "Bugünün Durumu" — işletmeyle ilgili canlı sayılar (yerel veritabanından):
 * aktif servis, onay / parça bekleyen, teslim tarihi yaklaşan ve geçen (Adım 3.17),
 * vadesi gelen alacak. Eşitleme bilgisi burada değil, üst çubuktadır (K-013).
 */
export function TodayStatus() {
  const businessId = useSessionStore((s) => s.business?.id);
  const reminderDays = useSessionStore((s) => s.business?.settings?.default_service_reminder_days);

  const summary = useLiveQuery(
    async () => (businessId ? summarizeServices(await loadServiceFacts(businessId), todayLocalDate(), reminderDays) : undefined),
    [businessId, reminderDays]
  );
  const criticalStock = useLiveQuery(
    async () => (businessId ? (await loadStockFacts(businessId)).filter(isLow).length : 0),
    [businessId],
    0
  );
  const dueReminders = useLiveQuery(
    () =>
      businessId
        ? db.notifications
            .where("business_id")
            .equals(businessId)
            .filter((n) => n.type === "PAYMENT_DUE" && !n.resolved_at)
            .count()
        : 0,
    [businessId],
    0
  );

  const tiles: { label: string; value: number; href: string; Icon: LucideIcon; tone?: "warn" | "danger" }[] = [
    { label: "Aktif servis", value: summary?.active ?? 0, href: "/services", Icon: Wrench },
    { label: "Onay bekleyen", value: summary?.waitingApproval ?? 0, href: "/services", Icon: ClipboardCheck, tone: "warn" },
    { label: "Parça bekleyen", value: summary?.waitingParts ?? 0, href: "/services", Icon: PackageOpen, tone: "warn" },
    { label: "Teslimi yaklaşan", value: summary?.upcoming ?? 0, href: "/services", Icon: CalendarClock, tone: "warn" },
    { label: "Teslimi geçen", value: summary?.overdue ?? 0, href: "/services", Icon: AlarmClock, tone: "danger" },
    { label: "Kritik stok", value: criticalStock, href: "/products", Icon: PackageX, tone: "warn" },
    { label: "Vadesi gelen alacak", value: dueReminders, href: "/reports/balances", Icon: CircleDollarSign, tone: "warn" },
  ];

  return (
    <div className="tile-grid">
      {tiles
        .filter((t) => t.value > 0 || t.label === "Aktif servis")
        .map(({ label, value, href, Icon, tone }) => (
          <Link key={label} href={href} className="tile" data-tone={value > 0 ? tone ?? "accent" : undefined} aria-label={`${label}: ${value}`}>
            <span className="tile-head">
              <span className="tile-value">{value}</span>
              <span className="tile-icon">
                <Icon size={17} aria-hidden="true" />
              </span>
            </span>
            <span className="tile-label">{label}</span>
          </Link>
        ))}
    </div>
  );
}
