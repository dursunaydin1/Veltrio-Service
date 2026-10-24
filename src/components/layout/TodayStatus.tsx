"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
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

  const tiles: { label: string; value: number; href: string; warn?: boolean }[] = [
    { label: "Aktif servis", value: summary?.active ?? 0, href: "/services" },
    { label: "Onay bekleyen", value: summary?.waitingApproval ?? 0, href: "/services", warn: true },
    { label: "Parça bekleyen", value: summary?.waitingParts ?? 0, href: "/services", warn: true },
    { label: "Teslimi yaklaşan", value: summary?.upcoming ?? 0, href: "/services", warn: true },
    { label: "Teslimi geçen", value: summary?.overdue ?? 0, href: "/services", warn: true },
    { label: "Vadesi gelen alacak", value: dueReminders, href: "/reports/balances", warn: true },
  ];

  return (
    <div className="tile-grid">
      {tiles
        .filter((t) => t.value > 0 || t.label === "Aktif servis")
        .map((t) => (
          <Link key={t.label} href={t.href} className="tile" aria-label={t.label}>
            <div className="tile-label">{t.label}</div>
            <div className="tile-value" style={{ color: t.warn && t.value > 0 ? "var(--accent-warning)" : undefined }}>{t.value}</div>
          </Link>
        ))}
    </div>
  );
}
