"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Service, ServiceOperation } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { EDITABLE_STATUSES, getServiceLines, removeOperation } from "@/lib/services/quote";
import { DEFAULT_APPROVAL_THRESHOLD } from "@/lib/services/service";
import { approvalRequired, summarizeLines } from "@/lib/services/lines";
import { useSessionStore } from "@/stores/session";
import { formatCurrency, formatDateTime, formatKurus, formatQuantity } from "@/lib/utils";
import type { TaxMode } from "@/types";
import { confirmDialog } from "@/components/common/ConfirmDialog";
import { errorMessage } from "@/lib/errors/message";
import { STATUS_LABEL, STATUS_BADGE } from "@/components/services/serviceLineLabels";
import { PartRow } from "@/components/services/ServicePartRow";
import { OperationForm } from "@/components/services/ServiceOperationForm";
import { PartForm } from "@/components/services/ServicePartForm";
import { ApprovalForm } from "@/components/services/ServiceApprovalForm";

type Mode = null | { type: "op"; edit?: ServiceOperation } | { type: "part" } | { type: "approval" };

/** Servis kalemleri: işlemler, parçalar, teklif özeti, müşteri kararı (Adım 3.8-3.9). */
export function ServiceLines({ service, onApproved, onNext }: { service: Service; onApproved?: () => void; onNext?: () => void }) {
  const ctx = useServiceContext();
  const settings = useSessionStore((s) => s.business?.settings);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);

  const lines = useLiveQuery(() => getServiceLines(service.id), [service.id]);
  const approvals = useLiveQuery(async () => {
    const all = await db.service_approvals.where("service_id").equals(service.id).toArray();
    return all.sort((a, b) => b.decided_at.localeCompare(a.decided_at));
  }, [service.id]);

  const editable = EDITABLE_STATUSES.includes(service.status);
  const threshold = ctx?.approvalThreshold ?? DEFAULT_APPROVAL_THRESHOLD;
  const summary = summarizeLines([...(lines?.operations ?? []), ...(lines?.parts ?? [])]);
  const needsDecision = approvalRequired(summary.quote, threshold) && summary.pendingCount > 0;
  const defaultTax = {
    mode: (settings?.default_tax_mode ?? "INCLUSIVE") as TaxMode,
    rate: settings?.default_tax_rate ?? 20,
  };

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e, "İşlem yapılamadı."));
    }
  }

  return (
    <section className="card stack stack-md" aria-labelledby="ln-title">
      <h2 id="ln-title">İşlemler ve parçalar</h2>

      <div className="tile-grid">
        <div className="tile">
          <div className="tile-label">Teklif toplamı</div>
          <div className="tile-value">{formatKurus(summary.quote)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Onaylanan</div>
          <div className="tile-value">{formatKurus(summary.approved)}</div>
        </div>
      </div>

      {needsDecision ? (
        <div className="alert alert-warning" role="alert">
          {threshold > 0
            ? `Teklif ${formatCurrency(threshold)} onay sınırını aşıyor; işe başlamadan müşterinin kararını kaydedin.`
            : "İşe başlamadan müşterinin kararını (onay / ret) kaydedin. Onay sınırı Ayarlar → İşletme ayarları'ndan değiştirilebilir."}
        </div>
      ) : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      {mode === null ? (
        <>
          {lines === undefined ? null : lines.operations.length + lines.parts.length === 0 ? (
            <p>Henüz işlem veya parça eklenmedi.</p>
          ) : (
            <ul className="menu-list" aria-label="Kalemler">
              {lines.operations.map((op) => (
                <li key={op.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
                  <span className="row row-between" style={{ gap: 8 }}>
                    <strong>{op.description}</strong>
                    <strong>{op.price_pending ? "Fiyat bekleniyor" : formatCurrency(op.line_total)}</strong>
                  </span>
                  <span className="row row-between">
                    <small style={{ color: "var(--text-muted)" }}>
                      İşlem · {formatQuantity(op.quantity)} × {formatCurrency(op.unit_price)}
                    </small>
                    <span className={`badge ${STATUS_BADGE[op.status]}`}>{STATUS_LABEL[op.status]}</span>
                  </span>
                  {editable ? (
                    <span className="row row-gap-sm">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode({ type: "op", edit: op })}>Düzenle</button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={async () => { if (ctx && (await confirmDialog({ title: "Bu işlem satırı kaldırılsın mı?", confirmLabel: "Kaldır", danger: true }))) await run(() => removeOperation(ctx, op.id)); }}
                      >
                        Kaldır
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}

              {lines.parts.map((part) => (
                <PartRow key={part.id} part={part} service={service} editable={editable} run={run} />
              ))}
            </ul>
          )}

          {editable ? (
            <div className="row row-gap-md">
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode({ type: "op" })}>
                + İşlem ekle
              </button>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode({ type: "part" })}>
                + Parça ekle
              </button>
            </div>
          ) : (
            <p>Bu durumda kalem değiştirilemez; gerekirse servisi yeniden açın.</p>
          )}

          {/* Kalemler bitti ve karar gerekmiyorsa: Özet'teki sıradaki adıma dön (K-084) */}
          {onNext && !needsDecision && lines && lines.operations.length + lines.parts.length > 0 ? (
            <button type="button" className="btn btn-primary btn-full" onClick={onNext}>
              Sıradaki adım →
            </button>
          ) : null}
          {editable && summary.pendingCount > 0 ? (
            <button type="button" className="btn btn-primary btn-full" onClick={() => setMode({ type: "approval" })}>
              Müşteri kararını kaydet ({summary.pendingCount} kalem bekliyor)
            </button>
          ) : null}
        </>
      ) : mode.type === "op" ? (
        <OperationForm service={service} edit={mode.edit} defaultTax={defaultTax} onDone={() => setMode(null)} />
      ) : mode.type === "part" ? (
        <PartForm service={service} defaultTax={defaultTax} onDone={() => setMode(null)} />
      ) : (
        <ApprovalForm
          service={service}
          lines={lines}
          onDone={() => setMode(null)}
          onSaved={() => {
            setMode(null);
            onApproved?.();
          }}
        />
      )}

      {approvals && approvals.length > 0 ? (
        <>
          <h3>Onay geçmişi</h3>
          <ul className="menu-list" aria-label="Onay geçmişi">
            {approvals.map((a) => (
              <li key={a.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
                <strong>
                  {a.decision === "APPROVED" ? "Onaylandı" : a.decision === "REJECTED" ? "Reddedildi" : a.decision === "DEFERRED" ? "Ertelendi" : "Kısmen onaylandı"}{" "}
                  · Onaylı tutar: {formatCurrency(a.approved_amount)}
                </strong>
                <small style={{ color: "var(--text-muted)" }}>
                  {formatDateTime(a.decided_at)} · {a.method === "IN_PERSON" ? "Yüz yüze" : a.method === "PHONE" ? "Telefon" : "Diğer"}
                  {a.explanation ? ` · ${a.explanation}` : ""}
                </small>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
