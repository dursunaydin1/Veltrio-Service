"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Service } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { useServiceContext } from "@/hooks/useServiceContext";
import { machineTitle } from "@/components/machines/MachineList";
import { ServiceLines } from "@/components/services/ServiceLines";
import { StatusBadge } from "@/components/services/StatusBadge";
import { changeServiceStatus, updateServiceDetails } from "@/lib/services/service";
import {
  SERVICE_TRANSITIONS,
  isReopen,
  isServiceStatus,
  requiresReason,
  statusLabel,
  type ServiceStatus,
} from "@/lib/services/status";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

/** Servis detayı: özet, durum geçişleri, bilgiler (şikâyet / teşhis / yapılan iş) ve durum geçmişi (Adım 3.7, 3.17). */
export function ServiceDetail({ id }: { id: string }) {
  const found = useLiveQuery(() => db.services.where("id").equals(id).toArray(), [id]);
  const related = useLiveQuery(async () => {
    const s = found?.[0];
    if (!s) return undefined;
    const [customer, machine] = await Promise.all([
      s.customer_id ? db.customers.get(s.customer_id) : undefined,
      s.machine_id ? db.machines.get(s.machine_id) : undefined,
    ]);
    return { customer, machine };
  }, [found]);

  if (found === undefined) return null;
  if (found.length === 0) {
    return (
      <div className="alert alert-warning" role="alert">
        Servis bulunamadı. Başka bir cihazda henüz eşitlenmemiş olabilir.
      </div>
    );
  }
  const service = found[0];

  return (
    <div className="stack stack-lg">
      <div className="stack stack-sm">
        <div className="row row-between">
          <h1>{service.document_no}</h1>
          <StatusBadge status={service.status} />
        </div>
        <p>
          {related?.customer ? <Link href={`/customers/${related.customer.id}`}>{related.customer.name}</Link> : "—"}
          {" · "}
          {related?.machine ? <Link href={`/machines/${related.machine.id}`}>{machineTitle(related.machine)}</Link> : "—"}
        </p>
        <small style={{ color: "var(--text-muted)" }}>
          Kabul: {formatDateTime(service.received_date)}
          {service.promised_date ? ` · Teslim sözü: ${formatDate(service.promised_date + "T00:00:00")}` : ""}
          {service.deposit_amount > 0 ? ` · Kapora: ${formatCurrency(service.deposit_amount)}` : ""}
        </small>
        {service.status === "CANCELLED" && service.cancel_reason ? (
          <div className="alert alert-error" role="note">İptal nedeni: {service.cancel_reason}</div>
        ) : null}
      </div>

      <StatusActions service={service} />
      <ServiceLines service={service} />
      <DetailsForm key={`${service.id}:${service.version ?? 0}:${service.updated_at}`} service={service} />
      <History serviceId={service.id} />
    </div>
  );
}

function StatusActions({ service }: { service: Service }) {
  const ctx = useServiceContext();
  const [pending, setPending] = useState<ServiceStatus | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isServiceStatus(service.status)) return null;
  const from = service.status;
  const options = SERVICE_TRANSITIONS[from];
  if (options.length === 0) return null;

  async function go(to: ServiceStatus, note?: string) {
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    setError(null);
    try {
      await changeServiceStatus(ctx, service.id, to, note);
      setPending(null);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Durum değiştirilemedi.");
    }
    setBusy(false);
  }

  function choose(to: ServiceStatus) {
    if (requiresReason(from, to)) {
      setPending(to);
      setError(null);
    } else {
      void go(to);
    }
  }

  return (
    <section className="card stack stack-md" aria-labelledby="st-title">
      <h2 id="st-title">Durumu değiştir</h2>

      {pending ? (
        <form
          className="stack stack-md"
          onSubmit={(e) => {
            e.preventDefault();
            void go(pending, reason);
          }}
        >
          <p>
            <strong>{statusLabel(from)}</strong> → <strong>{statusLabel(pending)}</strong>
          </p>
          <div className="form-group">
            <label className="form-label" htmlFor="st-reason">
              {pending === "CANCELLED" ? "İptal nedeni *" : isReopen(from, pending) ? "Yeniden açma nedeni *" : "Neden *"}
            </label>
            <input id="st-reason" className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPending(null)} disabled={busy}>Vazgeç</button>
            <button type="submit" className={`btn ${pending === "CANCELLED" ? "btn-danger" : "btn-primary"}`} style={{ flex: 1 }} disabled={busy}>
              Onayla
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
            {options.map((to) => (
              <button
                key={to}
                type="button"
                className={`btn btn-sm ${to === "CANCELLED" ? "btn-danger" : isReopen(from, to) ? "btn-secondary" : "btn-primary"}`}
                onClick={() => choose(to)}
                disabled={busy}
              >
                {isReopen(from, to) ? "Yeniden aç" : to === "CANCELLED" ? "İptal et" : statusLabel(to)}
              </button>
            ))}
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        </>
      )}
    </section>
  );
}

function DetailsForm({ service }: { service: Service }) {
  const ctx = useBusinessContext();
  const [complaint, setComplaint] = useState(service.customer_complaint ?? "");
  const [diagnosis, setDiagnosis] = useState(service.diagnosis ?? "");
  const [resolution, setResolution] = useState(service.resolution ?? "");
  const [promised, setPromised] = useState(service.promised_date ?? "");
  const [damage, setDamage] = useState(service.existing_damage ?? "");
  const [accessories, setAccessories] = useState(service.received_accessories ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const locked = service.status === "CANCELLED";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateServiceDetails(ctx, service.id, {
        customer_complaint: complaint,
        diagnosis,
        resolution,
        promised_date: promised || undefined,
        existing_damage: damage,
        received_accessories: accessories,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    }
    setBusy(false);
  }

  return (
    <form className="card stack stack-md" onSubmit={submit} noValidate aria-labelledby="dt-title">
      <h2 id="dt-title">Servis bilgileri</h2>
      <div className="form-group">
        <label className="form-label" htmlFor="dt-complaint">Müşteri şikâyeti *</label>
        <textarea id="dt-complaint" className="form-input" rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)} disabled={locked} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="dt-diagnosis">Teşhis</label>
        <textarea id="dt-diagnosis" className="form-input" rows={3} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} disabled={locked} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="dt-resolution">Yapılan iş</label>
        <textarea id="dt-resolution" className="form-input" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={locked} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="dt-promised">Teslim sözü</label>
        <input id="dt-promised" className="form-input" type="date" value={promised} onChange={(e) => setPromised(e.target.value)} disabled={locked} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="dt-damage">Mevcut hasar / çizikler</label>
        <input id="dt-damage" className="form-input" value={damage} onChange={(e) => setDamage(e.target.value)} disabled={locked} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="dt-acc">Teslim alınan aksesuarlar</label>
        <input id="dt-acc" className="form-input" value={accessories} onChange={(e) => setAccessories(e.target.value)} disabled={locked} />
      </div>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {saved ? <div className="alert alert-success" role="status">Kaydedildi.</div> : null}
      {!locked ? (
        <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      ) : null}
    </form>
  );
}

function History({ serviceId }: { serviceId: string }) {
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
            <li key={h.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
              <strong>
                {h.from_status ? `${statusLabel(h.from_status)} → ` : ""}
                {statusLabel(h.to_status)}
              </strong>
              <small style={{ color: "var(--text-muted)" }}>
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
