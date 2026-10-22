"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { parseMoneyInput } from "@/lib/calc";
import { balanceState } from "@/lib/finance/balance";
import {
  PAYMENT_METHOD_LABELS,
  getCustomerBalance,
  recordCustomerPayment,
  reversePayment,
  reversedPaymentIds,
  setCustomerOpeningBalance,
} from "@/lib/finance/service";
import { formatCurrency, formatDateTime, todayLocalDate } from "@/lib/utils";
import type { Customer, Payment, PaymentDirection, PaymentMethod } from "@/types";

type Mode = null | "collect" | "payout" | "opening";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Müşteri sayfasındaki bakiye bölümü: bakiye, tahsilat / ödeme, açılış bakiyesi, ödeme geçmişi (Adım 2.7-2.8). */
export function BalancePanel({ customer }: { customer: Customer }) {
  const [mode, setMode] = useState<Mode>(null);

  const balance = useLiveQuery(
    () => getCustomerBalance(customer.business_id, customer.id),
    [customer.id, customer.business_id]
  );
  const payments = useLiveQuery(async () => {
    const all = await db.payments.where("customer_id").equals(customer.id).toArray();
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [customer.id]);

  const state = balance ? balanceState(balance.balance) : "CLEAR";
  const reversed = reversedPaymentIds(payments ?? []);

  return (
    <section className="card stack stack-md" aria-labelledby="balance-title">
      <h2 id="balance-title">Bakiye</h2>

      <div className="tile">
        <div className="tile-label">
          {state === "DEBT" ? "Müşteri borçlu" : state === "CREDIT" ? "Müşteri alacaklı (işletme borçlu)" : "Bakiye yok"}
        </div>
        <div
          className="tile-value"
          style={{ color: state === "DEBT" ? "var(--accent-warning)" : state === "CREDIT" ? "var(--accent-success)" : undefined }}
        >
          {formatCurrency(Math.abs(balance?.balance ?? 0) / 100)}
        </div>
      </div>

      {mode === null ? (
        <div className="stack stack-sm">
          <button type="button" className="btn btn-primary btn-full" onClick={() => setMode("collect")}>
            Tahsilat al
          </button>
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode("payout")}>
              Müşteriye ödeme
            </button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode("opening")}>
              Açılış bakiyesi
            </button>
          </div>
        </div>
      ) : mode === "opening" ? (
        <OpeningForm customer={customer} onDone={() => setMode(null)} />
      ) : (
        <PaymentForm
          customer={customer}
          direction={mode === "collect" ? "IN" : "OUT"}
          onDone={() => setMode(null)}
        />
      )}

      <h3>Ödeme geçmişi</h3>
      {payments === undefined ? null : payments.length === 0 ? (
        <p>Henüz ödeme kaydı yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Ödemeler">
          {payments.slice(0, 30).map((p) => (
            <PaymentRow key={p.id} payment={p} cancelled={reversed.has(p.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PaymentRow({ payment, cancelled }: { payment: Payment; cancelled: boolean }) {
  const ctx = useBusinessContext();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isReversal = !!payment.reversal_of_id;
  const sign = payment.direction === "IN" ? "+" : "−";

  async function confirm() {
    if (!ctx) return;
    setBusy(true);
    setError(null);
    try {
      await reversePayment(ctx, payment.id, reason);
      setOpen(false);
    } catch (e) {
      setError(errorText(e, "Ters kayıt yapılamadı."));
      setBusy(false);
    }
  }

  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
      <span className="row row-between" style={{ opacity: cancelled ? 0.55 : 1 }}>
        <strong style={cancelled ? { textDecoration: "line-through" } : undefined}>
          {sign} {formatCurrency(payment.amount)}
        </strong>
        <span className="row row-gap-sm">
          {cancelled ? <span className="badge badge-gray">İptal edildi</span> : null}
          {isReversal ? <span className="badge badge-yellow">Ters kayıt</span> : null}
          <span className="badge badge-gray">{PAYMENT_METHOD_LABELS[payment.method]}</span>
        </span>
      </span>
      <small style={{ color: "var(--text-muted)" }}>
        {payment.direction === "IN" ? "Tahsilat" : "Müşteriye ödeme"} · {formatDateTime(payment.payment_date)}
        {payment.note ? ` · ${payment.note}` : ""}
      </small>

      {!cancelled && !isReversal ? (
        open ? (
          <div className="stack stack-sm">
            <input
              className="form-input"
              placeholder="Ters kayıt nedeni (zorunlu)"
              aria-label="Ters kayıt nedeni"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
            <div className="row row-gap-md">
              <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
              <button type="button" className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={confirm} disabled={busy}>
                Ters kaydı onayla
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>
            Hatalı — ters kaydet
          </button>
        )
      ) : null}
    </li>
  );
}

function PaymentForm({
  customer,
  direction,
  onDone,
}: {
  customer: Customer;
  direction: PaymentDirection;
  onDone: () => void;
}) {
  const ctx = useBusinessContext();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const kurus = parseMoneyInput(amount);
    if (kurus === null || kurus <= 0) return setError("Tutar sıfırdan büyük geçerli bir tutar olmalıdır (ör. 1.250,50).");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    setBusy(true);
    try {
      await recordCustomerPayment(ctx, { customerId: customer.id, direction, method, amountKurus: kurus, note });
      onDone();
    } catch (e) {
      setError(errorText(e, "Kaydedilemedi."));
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>{direction === "IN" ? "Tahsilat al" : "Müşteriye ödeme / iade"}</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="pay-amount">Tutar (₺) *</label>
        <input id="pay-amount" className="form-input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="pay-method">Ödeme yöntemi</label>
        <select id="pay-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="pay-note">Not</label>
        <input id="pay-note" className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </form>
  );
}

function OpeningForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const ctx = useBusinessContext();
  const existing = useLiveQuery(
    () =>
      db.opening_balances
        .where("party_id")
        .equals(customer.id)
        .filter((o) => o.party_type === "CUSTOMER")
        .first(),
    [customer.id]
  );

  const [direction, setDirection] = useState<"OWED_BY_PARTY" | "OWED_TO_PARTY">("OWED_BY_PARTY");
  const [amount, setAmount] = useState("");
  const [asOf, setAsOf] = useState(todayLocalDate());
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mevcut açılış bakiyesi varsa formu onunla doldur (bir kez).
  if (existing && loadedFor !== existing.id) {
    setLoadedFor(existing.id);
    setDirection(existing.direction);
    setAmount(existing.amount.toFixed(2).replace(".", ","));
    setAsOf(existing.as_of_date);
    setNote(existing.source_note ?? "");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const kurus = parseMoneyInput(amount);
    if (kurus === null) return setError("Tutar geçerli bir sayı olmalıdır (ör. 1.250,50).");
    if (existing && !reason.trim()) return setError("Açılış bakiyesini değiştirirken neden zorunludur.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    setBusy(true);
    try {
      await setCustomerOpeningBalance(ctx, {
        customerId: customer.id,
        direction,
        amountKurus: kurus,
        asOfDate: asOf,
        note,
        reason,
      });
      onDone();
    } catch (e) {
      setError(errorText(e, "Kaydedilemedi."));
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>Açılış bakiyesi</h3>
      <p>Uygulamaya geçmeden önceki borç / alacak. Sahte satış veya ödeme oluşturulmaz.</p>
      <div className="form-group">
        <label className="form-label" htmlFor="ob-direction">Yön</label>
        <select id="ob-direction" className="form-input" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
          <option value="OWED_BY_PARTY">Müşteri bize borçlu</option>
          <option value="OWED_TO_PARTY">Biz müşteriye borçluyuz</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="ob-amount">Tutar (₺) *</label>
        <input id="ob-amount" className="form-input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="ob-date">Bakiye tarihi</label>
        <input id="ob-date" className="form-input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="ob-note">Kaynak notu</label>
        <input id="ob-note" className="form-input" placeholder="Ör. eski defter" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {existing ? (
        <div className="form-group">
          <label className="form-label" htmlFor="ob-reason">Değiştirme nedeni *</label>
          <input id="ob-reason" className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      ) : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </form>
  );
}
