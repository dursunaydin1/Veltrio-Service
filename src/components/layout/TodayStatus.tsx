"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getIssueCount } from "@/lib/sync/queue";
import { useSessionStore } from "@/stores/session";

const CLOSED_SERVICE_STATUSES = ["DELIVERED", "CANCELLED"];

/**
 * "Bugünün Durumu" — yerel veritabanından canlı sayılar.
 * Kritik stok, teslim tarihi yaklaşanlar vb. ilgili fazlarda eklenecek.
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

  const issues = useLiveQuery(
    () => (businessId ? getIssueCount(businessId) : undefined),
    [businessId]
  );

  return (
    <div className="tile-grid">
      <div className="tile">
        <div className="tile-label">Aktif servis</div>
        <div className="tile-value">{activeServices}</div>
      </div>
      <div className="tile">
        <div className="tile-label">Eşitlenmeyi bekleyen</div>
        <div className="tile-value">{issues?.pending ?? 0}</div>
      </div>
      <div className="tile">
        <div className="tile-label">Eşitleme sorunu</div>
        <div className="tile-value">{(issues?.errors ?? 0) + (issues?.conflicts ?? 0)}</div>
      </div>
    </div>
  );
}
