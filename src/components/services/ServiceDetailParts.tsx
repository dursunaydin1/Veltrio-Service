"use client";

import { ArrowRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Service } from "@/lib/db";
import { getServiceBalance } from "@/lib/services/service";
import { SERVICE_STAGES, serviceStage, statusLabel } from "@/lib/services/status";
import { formatCurrency, formatDateTime } from "@/lib/utils";

/** Teslim edilmiş servisin özeti (K-085): ne zaman kime teslim edildi, ne tahsil edildi, borç kaldı mı. */
export function DeliveredCard({ service, onCollect }: { service: Service; onCollect: () => void }) {
  const balance = useLiveQuery(() => getServiceBalance(service.id), [service.id]);
  const deliveredAt = useLiveQuery(async () => {
    const rows = await db.service_status_history.where("service_id").equals(service.id).toArray();
    return rows.filter((r) => r.to_status === "DELIVERED").sort((a, b) => b.changed_at.localeCompare(a.changed_at))[0]?.changed_at;
  }, [service.id]);
  const remaining = Math.max(balance?.remaining ?? 0, 0);
  return (
    <section className="card stack stack-md" aria-labelledby="dv-title">
      <h2 id="dv-title">Teslim edildi</h2>
      <p>
        {deliveredAt ? formatDateTime(deliveredAt) : "—"}
        {service.delivered_to ? ` · Teslim alan: ${service.delivered_to}` : ""}
      </p>
      <div className="tile-grid">
        <div className="tile">
          <div className="tile-label">Tahsil edilen</div>
          <div className="tile-value">{formatCurrency((balance?.paid ?? 0) / 100)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Kalan borç</div>
          <div className="tile-value" style={remaining > 0 ? { color: "var(--warning-fg)" } : undefined}>{formatCurrency(remaining / 100)}</div>
        </div>
      </div>
      {remaining > 0 ? (
        <button type="button" className="btn btn-primary btn-full" onClick={onCollect}>
          Kalan borcu tahsil et
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

export function History({ serviceId }: { serviceId: string }) {
  const rows = useLiveQuery(async () => {
    const all = await db.service_status_history.where("service_id").equals(serviceId).toArray();
    return all.sort((a, b) => b.changed_at.localeCompare(a.changed_at));
  }, [serviceId]);

  return (
    <section className="card stack stack-md" aria-labelledby="hs-title">
      <h2 id="hs-title">Durum geçmişi</h2>
      {rows === undefined ? null : (
        <ul className="menu-list" aria-label="Durum geçmişi">
          {rows.map((h) => (
            <li key={h.id} className="line-item">
              <strong>
                {h.from_status ? `${statusLabel(h.from_status)} → ` : ""}
                {statusLabel(h.to_status)}
              </strong>
              <small className="muted">
                {formatDateTime(h.changed_at)}
                {h.note ? ` · ${h.note}` : ""}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Servisin hangi aşamada olduğunu gösteren beş adımlı ilerleme çubuğu. */
export function ServiceProgress({ status }: { status: string }) {
  const stage = serviceStage(status);
  if (stage < 0) return null;
  return (
    <ol className="progress-steps" aria-label={`Aşama: ${SERVICE_STAGES[stage]}`}>
      {SERVICE_STAGES.map((label, i) => (
        <li key={label} data-state={i < stage ? "done" : i === stage ? "current" : "todo"} aria-current={i === stage ? "step" : undefined}>
          <span className="progress-bar" aria-hidden="true" />
          <span className="progress-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
