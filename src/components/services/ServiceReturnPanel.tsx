"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Service } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { parseMoneyInput } from "@/lib/calc";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/service";
import { reverseReturn, type RefundMethod, type StockDisposition } from "@/lib/returns/service";
import {
  createServiceReturn,
  getReturnablePartQuantity,
  getServiceReturns,
  refundCancelledServicePayment,
} from "@/lib/returns/service-return";
import { getServiceBalance } from "@/lib/services/service";
import { formatCurrency, formatDateTime, formatQuantity } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

const DISPOSITION_LABEL: Record<StockDisposition, string> = {
  SELLABLE: "Satılabilir stoğa dön",
  DAMAGED: "Hasarlı stoğa al",
  NOT_RETURNED: "Stoğa dokunma",
};

/**
 * Teslim sonrası ücret iadesi / düzeltmesi (parça iadesi + serbest tutar) ve
 * iptal edilmiş serviste kapora iadesi (Adım 5.7).
 */
export function ServiceReturnPanel({ service }: { service: Service }) {
  if (service.status === "DELIVERED") return <DeliveredReturn service={service} />;
  if (service.status === "CANCELLED") return <CancelledRefund service={service} />;
  return null;
}

function CancelledRefund({ service }: { service: Service }) {
  const ctx = useServiceContext();
  const balance = useLiveQuery(() => getServiceBalance(service.id), [service.id]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refundable = balance?.paid ?? 0;
  if (refundable <= 0 && !open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const kurus = parseMoneyInput(amount);
    if (kurus === null || kurus <= 0) return setError("Tutar sıfırdan büyük geçerli bir tutar olmalıdır.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    try {
      await refundCancelledServicePayment(ctx, service.id, { amountKurus: kurus, method });
      setOpen(false);
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "İade kaydedilemedi.");
    }
    setBusy(false);
  }

  return (
    <section className="card stack stack-md" aria-labelledby="cr-title">
      <h2 id="cr-title">Kapora iadesi</h2>
      <p>
        Servis iptal edildi; alınan {formatCurrency(refundable / 100)} müşterinin alacağı olarak duruyor. İade etmezseniz
        bakiyesinde kalır. Kullanılmış parçanın stoğu otomatik geri eklenmez; gerekirse stok düzeltmesi yapın.
      </p>
      {open ? (
        <form className="stack stack-md" onSubmit={submit} noValidate>
          <div className="row row-gap-md">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label" htmlFor="cr-amount">İade tutarı (₺) *</label>
              <input id="cr-amount" className="form-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="cr-method">Yöntem</label>
              <select id="cr-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setAmount((refundable / 100).toFixed(2).replace(".", ","))}>
            Tamamı: {formatCurrency(refundable / 100)}
          </button>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "İade et"}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>Kaporayı iade et</button>
      )}
    </section>
  );
}

function DeliveredReturn({ service }: { service: Service }) {
  const ctx = useServiceContext();
  const parts = useLiveQuery(async () => {
    const all = await db.service_parts.where("service_id").equals(service.id).toArray();
    const out = [];
    for (const part of all) out.push({ part, remaining: await getReturnablePartQuantity(part.id) });
    return out.filter((r) => r.remaining > 0);
  }, [service.id]);
  const returns = useLiveQuery(() => getServiceReturns(service.id), [service.id]);

  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [disp, setDisp] = useState<Record<string, StockDisposition>>({});
  const [extra, setExtra] = useState("");
  const [method, setMethod] = useState<RefundMethod>("CUSTOMER_CREDIT");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    const lines = [];
    for (const { part, remaining } of parts ?? []) {
      const raw = (qty[part.id] ?? "").trim().replace(",", ".");
      if (raw === "") continue;
      const quantity = Number(raw);
      if (!Number.isFinite(quantity) || quantity <= 0) return setError("İade miktarı sıfırdan büyük bir sayı olmalıdır.");
      if (quantity > remaining) return setError(`“${part.description_snapshot}” için en fazla ${formatQuantity(remaining)} iade edilebilir.`);
      lines.push({ servicePartId: part.id, quantity, disposition: disp[part.id] ?? "SELLABLE" });
    }
    let extraAmountKurus: number | undefined;
    if (extra.trim() !== "") {
      const kurus = parseMoneyInput(extra);
      if (kurus === null || kurus <= 0) return setError("Düzeltme tutarı geçerli bir tutar olmalıdır.");
      extraAmountKurus = kurus;
    }
    setBusy(true);
    try {
      await createServiceReturn(ctx, { serviceId: service.id, reason, refundMethod: method, lines, extraAmountKurus });
      setOpen(false);
      setQty({});
      setExtra("");
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "İade kaydedilemedi.");
    }
    setBusy(false);
  }

  async function reverse(id: string) {
    if (!ctx) return;
    setBusy(true);
    setError(null);
    try {
      await reverseReturn(ctx, id, reverseReason);
      setReversing(null);
      setReverseReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geri alınamadı.");
    }
    setBusy(false);
  }

  return (
    <section className="card stack stack-md" aria-labelledby="dr-title">
      <h2 id="dr-title">Ücret iadesi / düzeltme</h2>
      <p>Teslim edilen servis iptal edilemez; hata, iade veya ücret düzeltmesiyle giderilir.</p>

      {open ? (
        <form className="stack stack-md" onSubmit={submit} noValidate>
          {(parts ?? []).map(({ part, remaining }) => (
            <div key={part.id} className="stack stack-sm">
              <strong>{part.description_snapshot}</strong>
              <small style={{ color: "var(--text-muted)" }}>İade edilebilir {formatQuantity(remaining)} {part.unit}</small>
              <div className="row row-gap-md">
                <input
                  className="form-input"
                  style={{ flex: 1 }}
                  inputMode="decimal"
                  placeholder="Miktar"
                  aria-label={`${part.description_snapshot} iade miktarı`}
                  value={qty[part.id] ?? ""}
                  onChange={(e) => setQty({ ...qty, [part.id]: e.target.value })}
                />
                {part.source_type === "STOCK_PRODUCT" ? (
                  <select
                    className="form-input"
                    style={{ flex: 2 }}
                    aria-label={`${part.description_snapshot} ürün durumu`}
                    value={disp[part.id] ?? "SELLABLE"}
                    onChange={(e) => setDisp({ ...disp, [part.id]: e.target.value as StockDisposition })}
                  >
                    {(Object.keys(DISPOSITION_LABEL) as StockDisposition[]).map((d) => (
                      <option key={d} value={d}>{DISPOSITION_LABEL[d]}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>
          ))}
          <div className="form-group">
            <label className="form-label" htmlFor="dr-extra">Parçaya bağlı olmayan düzeltme (₺)</label>
            <input id="dr-extra" className="form-input" inputMode="decimal" placeholder="0,00 (işçilik indirimi vb.)" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="dr-method">Para iadesi</label>
            <select id="dr-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)}>
              <option value="CUSTOMER_CREDIT">Müşteri alacağına yaz / borcundan düş</option>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]} ile iade et</option>
              ))}
            </select>
            <small style={{ color: "var(--text-muted)" }}>
              Servis tamamen ödenmediyse tutar önce müşterinin borcunu düşürür; yalnızca fazla ödenen kısım iade edilir.
            </small>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="dr-reason">Neden *</label>
            <input id="dr-reason" className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>İade / düzeltme yap</button>
      )}

      {returns && returns.length > 0 ? (
        <ul className="menu-list" aria-label="Servis iadeleri">
          {returns.map((r) => (
            <li key={r.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", opacity: r.status === "REVERSED" ? 0.55 : 1 }}>
              <span className="row row-between">
                <strong>{r.document_no}</strong>
                <span className="row row-gap-sm">
                  {r.status === "REVERSED" ? <span className="badge badge-gray">Geri alındı</span> : null}
                  <strong>{formatCurrency(r.total_amount)}</strong>
                </span>
              </span>
              <small style={{ color: "var(--text-muted)" }}>
                {formatDateTime(r.return_date)} · {r.refund_method === "CUSTOMER_CREDIT" ? "Müşteri alacağı / borçtan düşüldü" : PAYMENT_METHOD_LABELS[r.refund_method as PaymentMethod] ?? r.refund_method}
                {r.reason ? ` · ${r.reason}` : ""}
              </small>
              {r.status === "POSTED" ? (
                reversing === r.id ? (
                  <div className="stack stack-sm">
                    <input className="form-input" placeholder="Geri alma nedeni *" aria-label="Geri alma nedeni" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
                    {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
                    <div className="row row-gap-md">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReversing(null)} disabled={busy}>Vazgeç</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => reverse(r.id)} disabled={busy}>Geri al</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => { setError(null); setReversing(r.id); }}>
                    Hatalı kayıt: geri al
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
