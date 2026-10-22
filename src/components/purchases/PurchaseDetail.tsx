"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Purchase } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { PURCHASE_STATUS_BADGE, PURCHASE_STATUS_LABEL } from "@/components/purchases/PurchaseList";
import { PurchaseForm } from "@/components/purchases/PurchaseForm";
import { parseMoneyInput } from "@/lib/calc";
import { PAYMENT_METHOD_LABELS, reversedPaymentIds } from "@/lib/finance/service";
import {
  cancelDraftPurchase,
  getPurchaseBalance,
  getPurchaseItems,
  getPurchasePayments,
  payPurchase,
  receivePurchase,
} from "@/lib/purchases/service";
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

const money = (kurus: number) => formatCurrency(kurus / 100);

/** Satın alma detayı: satırlar, teslim alma, iptal, ödemeler (Adım 4.6-4.7). */
export function PurchaseDetail({ id }: { id: string }) {
  const found = useLiveQuery(() => db.purchases.where("id").equals(id).toArray(), [id]);
  const supplier = useLiveQuery(
    async () => {
      const sid = found?.[0]?.supplier_id;
      return sid ? db.suppliers.get(sid) : undefined;
    },
    [found]
  );
  const items = useLiveQuery(() => getPurchaseItems(id), [id]);
  const [editing, setEditing] = useState(false);

  if (found === undefined) return null;
  if (found.length === 0) {
    return (
      <div className="alert alert-warning" role="alert">
        Alım bulunamadı. Başka bir cihazda henüz eşitlenmemiş olabilir.
      </div>
    );
  }
  const purchase = found[0];

  if (editing && purchase.status === "DRAFT") {
    return (
      <div className="stack stack-md">
        <h1>{purchase.document_no} — düzenle</h1>
        <PurchaseForm purchase={purchase} items={items ?? []} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="stack stack-lg">
      <div className="stack stack-sm">
        <div className="row row-between">
          <h1>{purchase.document_no}</h1>
          <span className={`badge ${PURCHASE_STATUS_BADGE[purchase.status]}`}>{PURCHASE_STATUS_LABEL[purchase.status]}</span>
        </div>
        <p>
          {supplier ? <Link href={`/suppliers/${supplier.id}`}>{supplier.name}</Link> : "—"}
          {" · "}
          {formatDate(purchase.purchase_date)}
          {purchase.supplier_ref ? ` · ${purchase.supplier_ref}` : ""}
        </p>
        {purchase.notes ? <small style={{ color: "var(--text-muted)" }}>{purchase.notes}</small> : null}
        {purchase.status === "CANCELLED" && purchase.cancel_reason ? (
          <div className="alert alert-error" role="note">İptal nedeni: {purchase.cancel_reason}</div>
        ) : null}
        {purchase.status === "RECEIVED" && (items?.length ?? 0) === 0 ? (
          <div className="alert alert-warning" role="note">Stok girişi yapılmadı: bu alım yalnızca toplam tutarla kaydedilmiş.</div>
        ) : null}
      </div>

      <section className="card stack stack-md" aria-labelledby="pi-title">
        <h2 id="pi-title">Alım kalemleri</h2>
        {items === undefined ? null : items.length === 0 ? (
          <p>Ürün satırı yok (hızlı alım). Toplam: <strong>{formatCurrency(purchase.total_amount)}</strong></p>
        ) : (
          <ul className="menu-list" aria-label="Alım kalemleri">
            {items.map((i) => (
              <li key={i.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
                <span className="row row-between">
                  <strong>{i.description_snapshot}</strong>
                  <strong>{formatCurrency(i.line_total)}</strong>
                </span>
                <small style={{ color: "var(--text-muted)" }}>
                  {formatQuantity(i.quantity)} × {formatCurrency(i.unit_price)}
                  {i.line_discount > 0 ? ` − ${formatCurrency(i.line_discount)} indirim` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
        <div className="row row-between">
          <strong>Toplam</strong>
          <strong>{formatCurrency(purchase.total_amount)}</strong>
        </div>
      </section>

      {purchase.status === "DRAFT" ? <DraftActions purchase={purchase} onEdit={() => setEditing(true)} /> : null}
      {purchase.status === "RECEIVED" ? <PurchasePayments purchase={purchase} /> : null}
    </div>
  );
}

function DraftActions({ purchase, onEdit }: { purchase: Purchase; onEdit: () => void }) {
  const ctx = useBusinessContext();
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function receive() {
    setError(null);
    let payment: { amountKurus: number; method: PaymentMethod } | undefined;
    if (paid.trim() !== "") {
      const kurus = parseMoneyInput(paid);
      if (kurus === null || kurus <= 0) return setError("Ödenen tutar sıfırdan büyük geçerli bir tutar olmalıdır.");
      payment = { amountKurus: kurus, method };
    }
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    try {
      await receivePurchase(ctx, purchase.id, payment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Teslim alınamadı.");
      setBusy(false);
    }
  }

  async function cancel() {
    if (!ctx) return;
    setBusy(true);
    setError(null);
    try {
      await cancelDraftPurchase(ctx, purchase.id, reason);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İptal edilemedi.");
      setBusy(false);
    }
  }

  return (
    <section className="card stack stack-md" aria-labelledby="da-title">
      <h2 id="da-title">Taslak alım</h2>
      <p>Taslak, stok ve tedarikçi borcunu etkilemez. Teslim aldığınızda stok girişi yapılır.</p>

      {cancelling ? (
        <div className="stack stack-md">
          <div className="form-group">
            <label className="form-label" htmlFor="pc-reason">İptal nedeni *</label>
            <input id="pc-reason" className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCancelling(false)} disabled={busy}>Vazgeç</button>
            <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={cancel} disabled={busy}>İptal et</button>
          </div>
        </div>
      ) : (
        <>
          <div className="row row-gap-md">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label" htmlFor="pr-paid">Teslimde ödenen (₺)</label>
              <input id="pr-paid" className="form-input" inputMode="decimal" placeholder="0,00" value={paid} onChange={(e) => setPaid(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="pr-method">Yöntem</label>
              <select id="pr-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <button type="button" className="btn btn-primary btn-full btn-lg" onClick={receive} disabled={busy}>
            {busy ? "İşleniyor…" : "Teslim al"}
          </button>
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onEdit} disabled={busy}>Düzenle</button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setCancelling(true)} disabled={busy}>İptal et</button>
          </div>
        </>
      )}
      {cancelling && error ? <div className="alert alert-error" role="alert">{error}</div> : null}
    </section>
  );
}

function PurchasePayments({ purchase }: { purchase: Purchase }) {
  const ctx = useBusinessContext();
  const balance = useLiveQuery(() => getPurchaseBalance(purchase.id), [purchase.id]);
  const payments = useLiveQuery(async () => {
    const all = await getPurchasePayments(purchase.id);
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [purchase.id]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reversed = reversedPaymentIds(payments ?? []);
  const remaining = balance?.remaining ?? 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const kurus = parseMoneyInput(amount);
    if (kurus === null || kurus <= 0) return setError("Tutar sıfırdan büyük geçerli bir tutar olmalıdır.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    try {
      await payPurchase(ctx, purchase.id, { amountKurus: kurus, method });
      setOpen(false);
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    }
    setBusy(false);
  }

  return (
    <section className="card stack stack-md" aria-labelledby="pp-title">
      <h2 id="pp-title">Ödemeler</h2>
      <div className="tile-grid">
        <div className="tile">
          <div className="tile-label">Alım tutarı</div>
          <div className="tile-value">{money(balance?.total ?? 0)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Ödenen</div>
          <div className="tile-value">{money(balance?.paid ?? 0)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">{remaining < 0 ? "Fazla ödeme" : "Kalan borç"}</div>
          <div className="tile-value" style={{ color: remaining > 0 ? "var(--accent-warning)" : remaining < 0 ? "var(--accent-success)" : undefined }}>
            {money(Math.abs(remaining))}
          </div>
        </div>
      </div>

      {open ? (
        <form className="stack stack-md" onSubmit={submit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="pp-amount">Tutar (₺) *</label>
            <input id="pp-amount" className="form-input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            {remaining > 0 ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAmount((remaining / 100).toFixed(2).replace(".", ","))}>
                Kalanın tamamı: {money(remaining)}
              </button>
            ) : null}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="pp-method">Yöntem</label>
            <select id="pp-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>
          Ödeme yap
        </button>
      )}

      {payments === undefined ? null : payments.length === 0 ? (
        <p>Bu alıma bağlı ödeme yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Alım ödemeleri">
          {payments.map((p) => (
            <li key={p.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", opacity: reversed.has(p.id) ? 0.55 : 1 }}>
              <span className="row row-between">
                <strong style={reversed.has(p.id) ? { textDecoration: "line-through" } : undefined}>
                  {p.direction === "OUT" ? "−" : "+"} {formatCurrency(p.amount)}
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
        Hatalı ödeme, tedarikçi sayfasındaki ödeme geçmişinden “ters kaydet” ile düzeltilir. Teslim alınmış alımdaki hatalar
        tedarikçiye iade ile düzeltilir (Faz 5).
      </small>
    </section>
  );
}
