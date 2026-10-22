"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Service } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { parseMoneyInput } from "@/lib/calc";
import { PAYMENT_METHOD_LABELS, reversedPaymentIds } from "@/lib/finance/service";
import {
  collectServicePayment,
  deliverService,
  getServiceBalance,
  getServicePayments,
} from "@/lib/services/service";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

const money = (kurus: number) => formatCurrency(kurus / 100);
const fieldMoney = (kurus: number) => (kurus / 100).toFixed(2).replace(".", ",");

function useBalance(serviceId: string) {
  return useLiveQuery(() => getServiceBalance(serviceId), [serviceId]);
}

/** Servis ödemeleri: toplam / tahsil edilen / kalan, ödeme geçmişi, tahsilat alma (Adım 3.12). */
export function ServicePayments({ service }: { service: Service }) {
  const balance = useBalance(service.id);
  const payments = useLiveQuery(async () => {
    const all = await getServicePayments(service.id);
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [service.id]);
  const [open, setOpen] = useState(false);

  const reversed = reversedPaymentIds(payments ?? []);
  const remaining = balance?.remaining ?? 0;

  return (
    <section className="card stack stack-md" aria-labelledby="sp-title">
      <h2 id="sp-title">Ödemeler</h2>

      <div className="tile-grid">
        <div className="tile">
          <div className="tile-label">Servis tutarı</div>
          <div className="tile-value">{money(balance?.total ?? 0)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Tahsil edilen</div>
          <div className="tile-value">{money(balance?.paid ?? 0)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">{remaining < 0 ? "Fazla ödeme" : "Kalan"}</div>
          <div
            className="tile-value"
            style={{ color: remaining > 0 ? "var(--accent-warning)" : remaining < 0 ? "var(--accent-success)" : undefined }}
          >
            {money(Math.abs(remaining))}
          </div>
        </div>
      </div>

      {open ? (
        <CollectForm service={service} onDone={() => setOpen(false)} />
      ) : service.status !== "CANCELLED" ? (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>
          Tahsilat al
        </button>
      ) : null}

      {payments === undefined ? null : payments.length === 0 ? (
        <p>Bu servise bağlı ödeme yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Servis ödemeleri">
          {payments.map((p) => (
            <li key={p.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", opacity: reversed.has(p.id) ? 0.55 : 1 }}>
              <span className="row row-between">
                <strong style={reversed.has(p.id) ? { textDecoration: "line-through" } : undefined}>
                  {p.direction === "IN" ? "+" : "−"} {formatCurrency(p.amount)}
                </strong>
                <span className="row row-gap-sm">
                  {reversed.has(p.id) ? <span className="badge badge-gray">İptal edildi</span> : null}
                  {p.reversal_of_id ? <span className="badge badge-yellow">Ters kayıt</span> : null}
                  <span className="badge badge-gray">{PAYMENT_METHOD_LABELS[p.method]}</span>
                </span>
              </span>
              <small style={{ color: "var(--text-muted)" }}>
                {formatDateTime(p.payment_date)}
                {p.note ? ` · ${p.note}` : ""}
              </small>
            </li>
          ))}
        </ul>
      )}
      <small style={{ color: "var(--text-muted)" }}>
        Hatalı ödeme, müşteri sayfasındaki ödeme geçmişinden “ters kaydet” ile düzeltilir.
      </small>
    </section>
  );
}

function CollectForm({ service, onDone }: { service: Service; onDone: () => void }) {
  const ctx = useServiceContext();
  const balance = useBalance(service.id);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const kurus = parseMoneyInput(amount);
    if (kurus === null || kurus <= 0) return setError("Tutar sıfırdan büyük geçerli bir tutar olmalıdır.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    setBusy(true);
    try {
      await collectServicePayment(ctx, service.id, { amountKurus: kurus, method, note });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>Tahsilat al</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="col-amount">Tutar (₺) *</label>
        <input id="col-amount" className="form-input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        {balance && balance.remaining > 0 ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAmount(fieldMoney(balance.remaining))}>
            Kalanın tamamı: {money(balance.remaining)}
          </button>
        ) : null}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="col-method">Ödeme yöntemi</label>
        <select id="col-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="col-note">Not</label>
        <input id="col-note" className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </form>
  );
}

/** "İş tamamlandı" durumundaki servisin teslim paneli: kalan bakiye, tahsilat, teslim alan, borç kabulü (§5.2, AC-025). */
export function DeliveryPanel({ service }: { service: Service }) {
  const ctx = useServiceContext();
  const balance = useBalance(service.id);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [receiver, setReceiver] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (service.status !== "COMPLETED") return null;

  const planned = amount.trim() === "" ? 0 : (parseMoneyInput(amount) ?? 0);
  const after = (balance?.remaining ?? 0) - planned;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    let payment: { amountKurus: number; method: PaymentMethod } | undefined;
    if (amount.trim() !== "") {
      const kurus = parseMoneyInput(amount);
      if (kurus === null || kurus <= 0) return setError("Tahsilat tutarı sıfırdan büyük geçerli bir tutar olmalıdır.");
      payment = { amountKurus: kurus, method };
    }
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    setBusy(true);
    try {
      await deliverService(ctx, service.id, { payment, receiverName: receiver, debtAcknowledged: ack });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Teslim edilemedi.");
      setBusy(false);
    }
  }

  return (
    <form className="card stack stack-md" onSubmit={submit} noValidate aria-labelledby="dl-title">
      <h2 id="dl-title">Teslim et</h2>

      <div className={`alert ${after > 0 ? "alert-warning" : "alert-success"}`} role="status">
        Kalan bakiye: <strong>{money(Math.max(balance?.remaining ?? 0, 0))}</strong>
        {planned > 0 ? <> · Bu tahsilattan sonra: <strong>{after > 0 ? money(after) : "borç yok"}</strong></> : null}
      </div>

      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 2 }}>
          <label className="form-label" htmlFor="dl-amount">Teslimde tahsilat (₺)</label>
          <input id="dl-amount" className="form-input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="dl-method">Yöntem</label>
          <select id="dl-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
            ))}
          </select>
        </div>
      </div>
      {balance && balance.remaining > 0 ? (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setAmount(fieldMoney(balance.remaining))}>
          Kalanın tamamını tahsil et
        </button>
      ) : null}

      <div className="form-group">
        <label className="form-label" htmlFor="dl-receiver">Teslim alan kişi (müşteri değilse adı)</label>
        <input id="dl-receiver" className="form-input" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
      </div>

      {after > 0 ? (
        <label className="row row-gap-sm" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          Müşteri kalan {money(after)} borcu kabul ediyor (borçlu teslim)
        </label>
      ) : null}

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>
        {busy ? "Teslim ediliyor…" : "Teslim et"}
      </button>
    </form>
  );
}
