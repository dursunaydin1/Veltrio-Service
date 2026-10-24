"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { CustomerPicker } from "@/components/customers/CustomerPicker";
import { MachineForm } from "@/components/machines/MachineForm";
import { machineTitle } from "@/components/machines/MachineList";
import { changeMachineOwner, mergeTemporaryMachine, setMachineArchived } from "@/lib/machines/service";
import { getMachineServiceSummary } from "@/lib/services/service";
import { StatusBadge } from "@/components/services/StatusBadge";
import { formatCurrency, formatDate, formatDateTime, todayLocalDate } from "@/lib/utils";
import type { Machine } from "@/types";

/** Makine profili: sahibi, bilgiler, sahiplik geçmişi, sahip değiştirme, arşivleme (Adım 3.3). */
export function MachineEditor({ id }: { id: string }) {
  const router = useRouter();
  const ctx = useBusinessContext();
  const [error, setError] = useState<string | null>(null);

  const found = useLiveQuery(() => db.machines.where("id").equals(id).toArray(), [id]);
  const owner = useLiveQuery(
    async () => {
      const machine = found?.[0];
      return machine?.customer_id ? db.customers.get(machine.customer_id) : undefined;
    },
    [found]
  );

  if (found === undefined) return null;
  if (found.length === 0) {
    return (
      <div className="alert alert-warning" role="alert">
        Makine bulunamadı. Başka bir cihazda silinmiş olabilir.
      </div>
    );
  }
  const machine = found[0];
  const archived = !!machine.archived_at;

  async function toggleArchived() {
    const question = archived
      ? "Bu makine arşivden çıkarılsın mı?"
      : "Bu makine arşivlensin mi? Servis geçmişi korunur; makine yeni işlemlerde listelenmez.";
    if (!ctx || !window.confirm(question)) return;
    setError(null);
    try {
      await setMachineArchived(ctx, machine.id, !archived);
      router.push("/machines");
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem yapılamadı.");
    }
  }

  return (
    <div className="stack stack-lg">
      <div className="stack stack-sm">
        <div className="row row-between">
          <h1>{machineTitle(machine)}</h1>
          <span className="row row-gap-sm">
            {machine.is_temporary ? <span className="badge badge-yellow">Geçici</span> : null}
            {archived ? <span className="badge badge-gray">Arşivde</span> : null}
          </span>
        </div>
        <p>
          {machine.type} · İç no: <strong>{machine.internal_number ?? "—"}</strong>
          {machine.serial_number ? ` · Seri no: ${machine.serial_number}` : ""}
        </p>
        {machine.sale_id ? (
          <p>
            Satış: <Link href={`/sales/${machine.sale_id}`}>satış belgesi</Link>
            {machine.sale_date ? ` · ${formatDate(machine.sale_date)}` : ""}
            {machine.sale_price != null ? ` · ${formatCurrency(machine.sale_price)}` : ""}
          </p>
        ) : null}
        <MachineStats machine={machine} />
        <p>
          Sahibi:{" "}
          {owner ? <Link href={`/customers/${owner.id}`}>{owner.name}</Link> : "—"}
        </p>
      </div>

      {!archived && machine.customer_id ? (
        <Link
          href={`/services/new?customer=${machine.customer_id}&machine=${machine.id}`}
          className="btn btn-primary btn-full"
        >
          Yeni servis başlat
        </Link>
      ) : null}

      <Link href={`/machines/${machine.id}/qr`} className="btn btn-secondary btn-full">
        QR etiketi göster / yazdır
      </Link>

      <MachineServices machineId={machine.id} />

      {machine.is_temporary && !archived ? <MergeSection machine={machine} /> : null}

      <MachineForm key={`${machine.id}:${machine.version ?? 0}`} machine={machine} />

      <OwnerSection machine={machine} />

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      <button type="button" className={`btn btn-full ${archived ? "btn-secondary" : "btn-danger"}`} onClick={toggleArchived}>
        {archived ? "Arşivden çıkar" : "Arşivle"}
      </button>
    </div>
  );
}

/** Servis sayısı, son servis ve garanti bitişi (bilgi amaçlı). */
function MachineStats({ machine }: { machine: Machine }) {
  const summary = useLiveQuery(() => getMachineServiceSummary(machine.id), [machine.id]);
  const warrantyOver = machine.warranty_until ? machine.warranty_until < todayLocalDate() : false;
  return (
    <p>
      Tamamlanan servis: <strong>{summary?.completedCount ?? 0}</strong>
      {summary?.lastService ? ` · Son servis: ${formatDate(summary.lastService.received_date)}` : ""}
      {machine.warranty_until ? (
        <>
          {" · "}Garanti bitişi: {formatDate(machine.warranty_until + "T00:00:00")}
          {warrantyOver ? " (süresi geçmiş görünüyor)" : ""}
        </>
      ) : null}
    </p>
  );
}

/** Geçici kaydı aynı müşterinin mevcut makinesiyle birleştirir; servisler hedefe taşınır (AC-051). */
function MergeSection({ machine }: { machine: Machine }) {
  const ctx = useBusinessContext();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const candidates = useLiveQuery(
    async () =>
      machine.customer_id
        ? (await db.machines.where("customer_id").equals(machine.customer_id).toArray()).filter(
            (m) => m.id !== machine.id && !m.is_temporary && !m.archived_at && !m.merged_into_id
          )
        : [],
    [machine.id, machine.customer_id]
  );
  if (!candidates || candidates.length === 0) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!target) return setError("Birleştirilecek makineyi seçin.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    try {
      await mergeTemporaryMachine(ctx, machine.id, target, reason);
      router.push(`/machines/${target}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Birleştirilemedi.");
      setBusy(false);
    }
  }

  return (
    <section className="card stack stack-md" aria-labelledby="mg-title">
      <h2 id="mg-title">Mevcut makineyle birleştir</h2>
      {open ? (
        <form className="stack stack-md" onSubmit={submit} noValidate>
          <p>Bu geçici kayıttaki servisler seçilen makineye taşınır, geçici kayıt arşivlenir. Hiçbir kayıt silinmez.</p>
          <select className="form-input" aria-label="Birleştirilecek makine" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Makine seç…</option>
            {candidates.map((m) => <option key={m.id} value={m.id}>{machineTitle(m)} · {m.internal_number ?? ""}</option>)}
          </select>
          <input className="form-input" placeholder="Birleştirme nedeni *" aria-label="Birleştirme nedeni" value={reason} onChange={(e) => setReason(e.target.value)} />
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>Birleştir</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>Birleştir…</button>
      )}
    </section>
  );
}

function OwnerSection({ machine }: { machine: Machine }) {
  const ctx = useBusinessContext();
  const [open, setOpen] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const history = useLiveQuery(async () => {
    const rows = await db.machine_ownership_history.where("machine_id").equals(machine.id).toArray();
    const customers = await db.customers.where("business_id").equals(machine.business_id).toArray();
    const names = new Map(customers.map((c) => [c.id, c.name]));
    return rows
      .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
      .map((r) => ({
        ...r,
        from: names.get(r.old_customer_id ?? "") ?? "—",
        to: names.get(r.new_customer_id ?? "") ?? "—",
      }));
  }, [machine.id, machine.business_id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!newOwner) return setError("Yeni sahibi seçin.");
    if (!reason.trim()) return setError("Sahip değiştirme nedeni zorunludur.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    setBusy(true);
    try {
      await changeMachineOwner(ctx, machine.id, newOwner, reason);
      setOpen(false);
      setNewOwner("");
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sahip değiştirilemedi.");
    }
    setBusy(false);
  }

  return (
    <section className="card stack stack-md" aria-labelledby="owner-title">
      <h2 id="owner-title">Sahiplik</h2>

      {open ? (
        <form className="stack stack-md" onSubmit={submit} noValidate>
          <CustomerPicker value={newOwner} onChange={setNewOwner} label="Yeni sahibi" />
          <div className="form-group">
            <label className="form-label" htmlFor="owner-reason">Neden *</label>
            <input id="owner-reason" className="form-input" placeholder="Ör. makine satıldı" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
              {busy ? "Kaydediliyor…" : "Sahibi değiştir"}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>
          Sahibi değiştir
        </button>
      )}

      <h3>Sahiplik geçmişi</h3>
      {history === undefined ? null : history.length === 0 ? (
        <p>Sahip değişikliği yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Sahiplik geçmişi">
          {history.map((h) => (
            <li key={h.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
              <strong>{h.from} → {h.to}</strong>
              <small style={{ color: "var(--text-muted)" }}>
                {formatDateTime(h.changed_at)} · {h.reason}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MachineServices({ machineId }: { machineId: string }) {
  const services = useLiveQuery(async () => {
    const all = await db.services.where("machine_id").equals(machineId).toArray();
    return all.sort((a, b) => b.received_date.localeCompare(a.received_date));
  }, [machineId]);

  return (
    <section className="card stack stack-md" aria-labelledby="ms-title">
      <h2 id="ms-title">Servis geçmişi</h2>
      {services === undefined ? null : services.length === 0 ? (
        <p>Bu makinede servis kaydı yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Servisler">
          {services.map((s) => (
            <li key={s.id}>
              <Link href={`/services/${s.id}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span className="row row-between" style={{ width: "100%" }}>
                  <span>{s.document_no}</span>
                  <StatusBadge status={s.status} />
                </span>
                <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                  {formatDate(s.received_date)} · {s.customer_complaint ?? ""}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
