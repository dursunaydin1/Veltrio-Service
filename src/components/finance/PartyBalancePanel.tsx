"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { CollectionForm, OpenItemsPanel } from "@/components/finance/OpenItemsPanel";
import { parseMoneyInput } from "@/lib/calc";
import { balanceState } from "@/lib/finance/balance";
import {
  PAYMENT_METHOD_LABELS,
  getCustomerBalance,
  getSupplierBalance,
  recordPartyPayment,
  reversePayment,
  reversedPaymentIds,
  setPartyOpeningBalance,
  type PartyType,
} from "@/lib/finance/service";
import { formatCurrency, formatDateTime, todayLocalDate } from "@/lib/utils";
import type { Payment, PaymentDirection, PaymentMethod } from "@/types";

type Mode = null | "primary" | "secondary" | "opening";
type OpeningDirection = "OWED_BY_PARTY" | "OWED_TO_PARTY";

/** Tarafa (müşteri / tedarikçi) göre değişen etiketler ve yönler. */
const CONFIG = {
  CUSTOMER: {
    debtLabel: "Müşteri borçlu",
    creditLabel: "Müşteri alacaklı (işletme borçlu)",
    primary: { direction: "IN" as PaymentDirection, button: "Tahsilat al", title: "Tahsilat al" },
    secondary: { direction: "OUT" as PaymentDirection, button: "Müşteriye ödeme", title: "Müşteriye ödeme / iade" },
    rowLabel: { IN: "Tahsilat", OUT: "Müşteriye ödeme" },
    openingDefault: "OWED_BY_PARTY" as OpeningDirection,
    openingOptions: [
      { value: "OWED_BY_PARTY", label: "Müşteri bize borçlu" },
      { value: "OWED_TO_PARTY", label: "Biz müşteriye borçluyuz" },
    ],
    debtIsWarning: true,
  },
  SUPPLIER: {
    debtLabel: "Tedarikçiye borçlusunuz",
    creditLabel: "Tedarikçi size borçlu (alacağınız)",
    primary: { direction: "OUT" as PaymentDirection, button: "Ödeme yap", title: "Tedarikçiye ödeme yap" },
    secondary: { direction: "IN" as PaymentDirection, button: "Tedarikçiden iade ödemesi", title: "Tedarikçiden iade ödemesi alındı" },
    rowLabel: { IN: "Tedarikçiden iade ödemesi", OUT: "Tedarikçiye ödeme" },
    openingDefault: "OWED_TO_PARTY" as OpeningDirection,
    openingOptions: [
      { value: "OWED_TO_PARTY", label: "Tedarikçiye borçluyuz" },
      { value: "OWED_BY_PARTY", label: "Tedarikçi bize borçlu" },
    ],
    debtIsWarning: true,
  },
} as const;

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

async function loadBalance(kind: PartyType, businessId: string, id: string) {
  return kind === "CUSTOMER" ? getCustomerBalance(businessId, id) : getSupplierBalance(businessId, id);
}

/**
 * Müşteri veya tedarikçi sayfasındaki bakiye bölümü: bakiye, ödeme / tahsilat,
 * açılış bakiyesi ve ödeme geçmişi (ters kayıt dahil) — Adım 2.7-2.8, 4.7.
 */
export function PartyBalancePanel({
  kind,
  party,
}: {
  kind: PartyType;
  party: { id: string; business_id: string };
}) {
  const cfg = CONFIG[kind];
  const [mode, setMode] = useState<Mode>(null);

  const balance = useLiveQuery(
    () => loadBalance(kind, party.business_id, party.id),
    [kind, party.id, party.business_id]
  );
  const payments = useLiveQuery(async () => {
    const all = await db.payments
      .where(kind === "CUSTOMER" ? "customer_id" : "supplier_id")
      .equals(party.id)
      .toArray();
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [kind, party.id]);

  const state = balance ? balanceState(balance.balance) : "CLEAR";
  const reversed = reversedPaymentIds(payments ?? []);

  return (
    <section className="card stack stack-md" aria-labelledby="balance-title">
      <h2 id="balance-title">Bakiye</h2>

      <div className="tile">
        <div className="tile-label">{state === "DEBT" ? cfg.debtLabel : state === "CREDIT" ? cfg.creditLabel : "Bakiye yok"}</div>
        <div
          className="tile-value"
          style={{ color: state === "DEBT" ? "var(--accent-warning)" : state === "CREDIT" ? "var(--accent-success)" : undefined }}
        >
          {formatCurrency(Math.abs(balance?.balance ?? 0) / 100)}
        </div>
      </div>

      {mode === null ? (
        <div className="stack stack-sm">
          <button type="button" className="btn btn-primary btn-full" onClick={() => setMode("primary")}>
            {cfg.primary.button}
          </button>
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode("secondary")}>
              {cfg.secondary.button}
            </button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode("opening")}>
              Açılış bakiyesi
            </button>
          </div>
        </div>
      ) : mode === "opening" ? (
        <OpeningForm kind={kind} party={party} onDone={() => setMode(null)} />
      ) : kind === "CUSTOMER" && mode === "primary" ? (
        <CollectionForm party={party} onDone={() => setMode(null)} />
      ) : (
        <PaymentForm
          kind={kind}
          party={party}
          direction={mode === "primary" ? cfg.primary.direction : cfg.secondary.direction}
          title={mode === "primary" ? cfg.primary.title : cfg.secondary.title}
          onDone={() => setMode(null)}
        />
      )}

      {kind === "CUSTOMER" ? <OpenItemsPanel party={party} /> : null}

      <h3>Ödeme geçmişi</h3>
      {payments === undefined ? null : payments.length === 0 ? (
        <p>Henüz ödeme kaydı yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Ödemeler">
          {payments.slice(0, 30).map((p) => (
            <PaymentRow key={p.id} kind={kind} payment={p} cancelled={reversed.has(p.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PaymentRow({ kind, payment, cancelled }: { kind: PartyType; payment: Payment; cancelled: boolean }) {
  const ctx = useBusinessContext();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isReversal = !!payment.reversal_of_id;
  // Yön işareti: kasaya giren (+) / kasadan çıkan (−)
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
        {CONFIG[kind].rowLabel[payment.direction]} · {formatDateTime(payment.payment_date)}
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
  kind,
  party,
  direction,
  title,
  onDone,
}: {
  kind: PartyType;
  party: { id: string };
  direction: PaymentDirection;
  title: string;
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
      await recordPartyPayment(ctx, { partyType: kind, partyId: party.id, direction, method, amountKurus: kurus, note });
      onDone();
    } catch (e) {
      setError(errorText(e, "Kaydedilemedi."));
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>{title}</h3>
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

function OpeningForm({
  kind,
  party,
  onDone,
}: {
  kind: PartyType;
  party: { id: string };
  onDone: () => void;
}) {
  const cfg = CONFIG[kind];
  const ctx = useBusinessContext();
  const existing = useLiveQuery(
    () =>
      db.opening_balances
        .where("party_id")
        .equals(party.id)
        .filter((o) => o.party_type === kind)
        .first(),
    [party.id, kind]
  );

  const [direction, setDirection] = useState<OpeningDirection>(cfg.openingDefault);
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
      await setPartyOpeningBalance(ctx, {
        partyType: kind,
        partyId: party.id,
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
        <select id="ob-direction" className="form-input" value={direction} onChange={(e) => setDirection(e.target.value as OpeningDirection)}>
          {cfg.openingOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
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
