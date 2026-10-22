"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Sale } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { SALE_STATUS_BADGE, SALE_STATUS_LABEL } from "@/components/sales/SaleList";
import { SaleForm } from "@/components/sales/SaleForm";
import { parseMoneyInput } from "@/lib/calc";
import { PAYMENT_METHOD_LABELS, reversedPaymentIds } from "@/lib/finance/service";
import {
  NegativeStockReasonRequiredError,
  cancelDraftSale,
  collectSalePayment,
  finalizeSale,
  getSaleBalance,
  getSaleItems,
  getSalePayments,
} from "@/lib/sales/service";
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

const money = (kurus: number) => formatCurrency(kurus / 100);

/** Satış detayı: satırlar, toplamlar, taslak işlemleri, tahsilat (Adım 4.8). */
export function SaleDetail({ id }: { id: string }) {
  const found = useLiveQuery(() => db.sales.where("id").equals(id).toArray(), [id]);
  const customer = useLiveQuery(
    async () => {
      const cid = found?.[0]?.customer_id;
      return cid ? db.customers.get(cid) : undefined;
    },
    [found]
  );
  const items = useLiveQuery(() => getSaleItems(id), [id]);
  const [editing, setEditing] = useState(false);

  if (found === undefined) return null;
  if (found.length === 0) {
    return (
      <div className="alert alert-warning" role="alert">
        Satış bulunamadı. Başka bir cihazda henüz eşitlenmemiş olabilir.
      </div>
    );
  }
  const sale = found[0];

  if (editing && sale.status === "DRAFT") {
    return (
      <div className="stack stack-md">
        <h1>{sale.document_no} — düzenle</h1>
        <SaleForm sale={sale} items={items ?? []} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="stack stack-lg">
      <div className="stack stack-sm">
        <div className="row row-between">
          <h1>{sale.document_no}</h1>
          <span className={`badge ${SALE_STATUS_BADGE[sale.status]}`}>{SALE_STATUS_LABEL[sale.status]}</span>
        </div>
        <p>
          {customer ? <Link href={`/customers/${customer.id}`}>{customer.name}</Link> : "Müşterisiz satış"}
          {" · "}
          {formatDate(sale.sale_date)}
        </p>
        {sale.notes ? <small style={{ color: "var(--text-muted)" }}>{sale.notes}</small> : null}
        {sale.status === "CANCELLED" && sale.cancel_reason ? (
          <div className="alert alert-error" role="note">İptal nedeni: {sale.cancel_reason}</div>
        ) : null}
      </div>

      <section className="card stack stack-md" aria-labelledby="si-title">
        <h2 id="si-title">Satış kalemleri</h2>
        <ul className="menu-list" aria-label="Satış kalemleri">
          {(items ?? []).map((i) => (
            <li key={i.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
              <span className="row row-between">
                <strong>{i.description_snapshot}</strong>
                <strong>{formatCurrency(i.line_total)}</strong>
              </span>
              <small style={{ color: "var(--text-muted)" }}>
                {formatQuantity(i.quantity)} {i.unit} × {formatCurrency(i.unit_price_snapshot)}
                {i.discount_amount > 0 ? ` − ${formatCurrency(i.discount_amount)} indirim` : ""}
              </small>
            </li>
          ))}
        </ul>
        <div className="stack stack-sm">
          <div className="row row-between"><span>Ara toplam (KDV hariç)</span><span>{formatCurrency(sale.subtotal)}</span></div>
          {sale.discount_total > 0 ? (
            <div className="row row-between"><span>Toplam indirim</span><span>− {formatCurrency(sale.discount_total)}</span></div>
          ) : null}
          <div className="row row-between"><span>KDV</span><span>{formatCurrency(sale.tax_total)}</span></div>
          <div className="row row-between"><strong>Genel toplam</strong><strong>{formatCurrency(sale.total_amount)}</strong></div>
        </div>
      </section>

      {sale.status === "DRAFT" ? <DraftActions sale={sale} onEdit={() => setEditing(true)} /> : null}
      {sale.status === "FINAL" ? <SalePayments sale={sale} /> : null}
    </div>
  );
}

function DraftActions({ sale, onEdit }: { sale: Sale; onEdit: () => void }) {
  const ctx = useServiceContext();
  const [received, setReceived] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reason, setReason] = useState("");
  const [negReason, setNegReason] = useState("");
  const [needsNeg, setNeedsNeg] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finalize() {
    setError(null);
    let payment: { amountKurus: number; method: PaymentMethod } | undefined;
    if (received.trim() !== "") {
      const kurus = parseMoneyInput(received);
      if (kurus === null || kurus <= 0) return setError("Alınan tutar sıfırdan büyük geçerli bir tutar olmalıdır.");
      payment = { amountKurus: kurus, method };
    }
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    try {
      await finalizeSale(ctx, sale.id, { payment, negativeStockReason: needsNeg ? negReason : undefined });
    } catch (e) {
      if (e instanceof NegativeStockReasonRequiredError) setNeedsNeg(true);
      setError(e instanceof Error ? e.message : "Satış tamamlanamadı.");
      setBusy(false);
    }
  }

  async function cancel() {
    if (!ctx) return;
    setBusy(true);
    setError(null);
    try {
      await cancelDraftSale(ctx, sale.id, reason);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İptal edilemedi.");
      setBusy(false);
    }
  }

  return (
    <section className="card stack stack-md" aria-labelledby="sd-title">
      <h2 id="sd-title">Taslak satış</h2>
      <p>Taslak, stok ve müşteri bakiyesini etkilemez. Tamamlayınca stok düşer.</p>

      {cancelling ? (
        <div className="stack stack-md">
          <div className="form-group">
            <label className="form-label" htmlFor="sc-reason">İptal nedeni *</label>
            <input id="sc-reason" className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCancelling(false)} disabled={busy}>Vazgeç</button>
            <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={cancel} disabled={busy}>İptal et</button>
          </div>
        </div>
      ) : (
        <>
          <div className="row row-gap-md">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label" htmlFor="sf-received">Alınan tutar (₺)</label>
              <input id="sf-received" className="form-input" inputMode="decimal" placeholder="0,00" value={received} onChange={(e) => setReceived(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="sf-method">Yöntem</label>
              <select id="sf-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setReceived(sale.total_amount.toFixed(2).replace(".", ","))}>
            Tamamı peşin: {formatCurrency(sale.total_amount)}
          </button>
          {needsNeg ? (
            <div className="form-group">
              <label className="form-label" htmlFor="sf-neg">Eksi stok nedeni *</label>
              <input id="sf-neg" className="form-input" value={negReason} onChange={(e) => setNegReason(e.target.value)} autoFocus />
            </div>
          ) : null}
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <button type="button" className="btn btn-primary btn-full btn-lg" onClick={finalize} disabled={busy}>
            {busy ? "İşleniyor…" : "Satışı tamamla"}
          </button>
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onEdit} disabled={busy}>Düzenle</button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setCancelling(true)} disabled={busy}>İptal et</button>
          </div>
        </>
      )}
    </section>
  );
}

function SalePayments({ sale }: { sale: Sale }) {
  const ctx = useServiceContext();
  const balance = useLiveQuery(() => getSaleBalance(sale.id), [sale.id]);
  const payments = useLiveQuery(async () => {
    const all = await getSalePayments(sale.id);
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [sale.id]);
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
      await collectSalePayment(ctx, sale.id, { amountKurus: kurus, method });
      setOpen(false);
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    }
    setBusy(false);
  }

  return (
    <section className="card stack stack-md" aria-labelledby="sp-title">
      <h2 id="sp-title">Tahsilat</h2>
      <div className="tile-grid">
        <div className="tile">
          <div className="tile-label">Satış tutarı</div>
          <div className="tile-value">{money(balance?.total ?? 0)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Tahsil edilen</div>
          <div className="tile-value">{money(balance?.paid ?? 0)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">{remaining < 0 ? "Fazla ödeme" : "Kalan (veresiye)"}</div>
          <div className="tile-value" style={{ color: remaining > 0 ? "var(--accent-warning)" : remaining < 0 ? "var(--accent-success)" : undefined }}>
            {money(Math.abs(remaining))}
          </div>
        </div>
      </div>

      {open ? (
        <form className="stack stack-md" onSubmit={submit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="sp-amount">Tutar (₺) *</label>
            <input id="sp-amount" className="form-input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            {remaining > 0 ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAmount((remaining / 100).toFixed(2).replace(".", ","))}>
                Kalanın tamamı: {money(remaining)}
              </button>
            ) : null}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sp-method">Yöntem</label>
            <select id="sp-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
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
          Tahsilat al
        </button>
      )}

      {payments === undefined ? null : payments.length === 0 ? (
        <p>Bu satışa bağlı tahsilat yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Satış tahsilatları">
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
        Kesinleşmiş satışın hatası iptal veya iade ile düzeltilir (Adım 4.4, Faz 5). Hatalı tahsilat, müşteri sayfasındaki geçmişten ters kaydedilir.
      </small>
    </section>
  );
}
