"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";

const CLOSED_SERVICE_STATUSES = ["DELIVERED", "CANCELLED"];

/**
 * "Bugünün Durumu" — işletmeyle ilgili canlı sayılar (yerel veritabanından).
 * Kritik stok, bugünkü satış, teslim tarihi yaklaşanlar vb. ilgili özellikler
 * yazıldıkça eklenir. Eşitleme bilgisi burada değil, üst çubuktadır (K-013).
 */
export function TodayStatus() {
  const businessId = useSessionStore((s) => s.business?.id);

  const activeServices = useLiveQuery(
    () =>
      businessId
        ? db.services
            .where("business_id")
            .equals(businessId)
            .filter((s) => !CLOSED_SERVICE_STATUSES.includes(s.status))
            .count()
        : 0,
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

  return (
    <div className="tile-grid">
      <div className="tile">
        <div className="tile-label">Aktif servis</div>
        <div className="tile-value">{activeServices}</div>
      </div>
      {dueReminders > 0 ? (
        <Link href="/reports/balances" className="tile" aria-label="Vadesi gelen alacaklar">
          <div className="tile-label">Vadesi gelen alacak</div>
          <div className="tile-value" style={{ color: "var(--accent-warning)" }}>{dueReminders}</div>
        </Link>
      ) : null}
    </div>
  );
}
