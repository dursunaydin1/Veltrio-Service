"use client";

import { useState } from "react";
import type { Service, ServiceOperation, ServicePart } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { recordApproval, type LineDecision } from "@/lib/services/quote";
import { formatCurrency } from "@/lib/utils";
import { OptionalField, OptionalGroup } from "@/components/common/OptionalField";
import { NO_CONTEXT_MESSAGE, errorMessage } from "@/lib/errors/message";

export function ApprovalForm({
  service,
  lines,
  onDone,
  onSaved,
}: {
  service: Service;
  lines: { operations: ServiceOperation[]; parts: ServicePart[] } | undefined;
  onDone: () => void;
  onSaved: () => void;
}) {
  const ctx = useServiceContext();
  const pending: { kind: "operation" | "part"; id: string; title: string; total: number }[] = [
    ...(lines?.operations ?? []).filter((o) => o.status === "PENDING").map((o) => ({ kind: "operation" as const, id: o.id, title: o.description, total: o.line_total })),
    ...(lines?.parts ?? []).filter((p) => p.status === "PENDING").map((p) => ({ kind: "part" as const, id: p.id, title: p.description_snapshot, total: p.line_total })),
  ];

  const [decisions, setDecisions] = useState<Record<string, LineDecision["decision"]>>({});
  const [method, setMethod] = useState<"IN_PERSON" | "PHONE" | "OTHER">("IN_PERSON");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx) return setError(NO_CONTEXT_MESSAGE);
    setBusy(true);
    setError(null);
    try {
      await recordApproval(ctx, service.id, {
        decisions: pending.map((p) => ({ kind: p.kind, id: p.id, decision: decisions[p.id] ?? "APPROVED" })),
        method,
        explanation,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "Kaydedilemedi."));
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>Müşteri kararı</h3>
      <p>Her kalem için müşterinin kararını seçin. Reddedilen ve ertelenen kalemler toplama girmez.</p>
      <ul className="menu-list" aria-label="Karar bekleyen kalemler">
        {pending.map((p) => (
          <li key={p.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
            <span className="row row-between">
              <strong>{p.title}</strong>
              <strong>{formatCurrency(p.total)}</strong>
            </span>
            <select
              className="form-input"
              aria-label={`${p.title} kararı`}
              value={decisions[p.id] ?? "APPROVED"}
              onChange={(e) => setDecisions((d) => ({ ...d, [p.id]: e.target.value as LineDecision["decision"] }))}
            >
              <option value="APPROVED">Onaylandı</option>
              <option value="REJECTED">Reddedildi</option>
              <option value="DEFERRED">Ertelendi</option>
            </select>
          </li>
        ))}
      </ul>
      <div className="form-group">
        <label className="form-label" htmlFor="ap-method">Onay yöntemi</label>
        <select id="ap-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="IN_PERSON">Yüz yüze</option>
          <option value="PHONE">Telefon</option>
          <option value="OTHER">Diğer</option>
        </select>
      </div>
      <OptionalGroup>
        <OptionalField label="Açıklama" htmlFor="ap-note" filled={!!explanation} onClear={() => setExplanation("")}>
          <input id="ap-note" className="form-input" placeholder="Ör. fiyatı kabul etti, parçayı sonra getirecek" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </OptionalField>
      </OptionalGroup>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Kararı kaydet"}</button>
      </div>
    </form>
  );
}
