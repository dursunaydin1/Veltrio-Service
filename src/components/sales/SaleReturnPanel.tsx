"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Sale, SaleItem } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/service";
import {
  createSaleReturn,
  getReturnableQuantity,
  getSaleReturns,
  reverseSaleReturn,
  type RefundMethod,
  type StockDisposition,
} from "@/lib/returns/service";
import { formatCurrency, formatDateTime, formatQuantity } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

const DISPOSITION_LABEL: Record<StockDisposition, string> = {
  SELLABLE: "Satılabilir stoğa dön",
  DAMAGED: "Hasarlı stoğa al",
  NOT_RETURNED: "Ürün geri gelmedi (stok değişmez)",
};

type Row = { item: SaleItem; remaining: number };

/** Müşteri ürün iadesi: satırlardan miktar ve ürün durumu seçilir, para iadesi yöntemi açıkça belirtilir (Adım 5.5). */
export function SaleReturnPanel({ sale }: { sale: Sale }) {
  const ctx = useServiceContext();
  const rows = useLiveQuery(async (): Promise<Row[]> => {
    const items = await db.sale_items.where("sale_id").equals(sale.id).toArray();
    const out: Row[] = [];
    for (const item of items.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      out.push({ item, remaining: await getReturnableQuantity(item) });
    }
    return out;
  }, [sale.id]);
  const returns = useLiveQuery(() => getSaleReturns(sale.id), [sale.id]);

  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [disp, setDisp] = useState<Record<string, StockDisposition>>({});
  const [method, setMethod] = useState<RefundMethod>(sale.customer_id ? "CUSTOMER_CREDIT" : "CASH");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const returnable = (rows ?? []).filter((r) => r.remaining > 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    const lines = [];
    for (const { item, remaining } of returnable) {
      const raw = (qty[item.id] ?? "").trim().replace(",", ".");
      if (raw === "") continue;
      const quantity = Number(raw);
      if (!Number.isFinite(quantity) || quantity <= 0) return setError("İade miktarı sıfırdan büyük bir sayı olmalıdır.");
      if (quantity > remaining) return setError(`“${item.description_snapshot}” için en fazla ${formatQuantity(remaining)} iade edilebilir.`);
      lines.push({ saleItemId: item.id, quantity, disposition: disp[item.id] ?? "SELLABLE" });
    }
    if (lines.length === 0) return setError("İade edilecek kalemin miktarını girin.");
    setBusy(true);
    try {
      await createSaleReturn(ctx, { saleId: sale.id, reason, refundMethod: method, lines });
      setOpen(false);
      setQty({});
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
      await reverseSaleReturn(ctx, id, reverseReason);
      setReversing(null);
      setReverseReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geri alınamadı.");
    }
    setBusy(false);
  }

  return (
    <section className="card stack stack-md" aria-labelledby="sr-title">
      <h2 id="sr-title">Ürün iadesi</h2>

      {open ? (
        <form className="stack stack-md" onSubmit={submit} noValidate>
          {returnable.map(({ item, remaining }) => (
            <div key={item.id} className="stack stack-sm">
              <strong>{item.description_snapshot}</strong>
              <small style={{ color: "var(--text-muted)" }}>
                Satılan {formatQuantity(item.quantity)} {item.unit} · iade edilebilir {formatQuantity(remaining)}
              </small>
              <div className="row row-gap-md">
                <input
                  className="form-input"
                  style={{ flex: 1 }}
                  inputMode="decimal"
                  placeholder="İade miktarı"
                  aria-label={`${item.description_snapshot} iade miktarı`}
                  value={qty[item.id] ?? ""}
                  onChange={(e) => setQty({ ...qty, [item.id]: e.target.value })}
                />
                <select
                  className="form-input"
                  style={{ flex: 2 }}
                  aria-label={`${item.description_snapshot} ürün durumu`}
                  value={disp[item.id] ?? "SELLABLE"}
                  onChange={(e) => setDisp({ ...disp, [item.id]: e.target.value as StockDisposition })}
                >
                  {(Object.keys(DISPOSITION_LABEL) as StockDisposition[]).map((d) => (
                    <option key={d} value={d}>{DISPOSITION_LABEL[d]}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <div className="form-group">
            <label className="form-label" htmlFor="sr-method">Para iadesi</label>
            <select id="sr-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)}>
              {sale.customer_id ? <option value="CUSTOMER_CREDIT">Müşteri alacağına yaz (nakit çıkmaz)</option> : null}
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]} ile iade et</option>
              ))}
            </select>
            <small style={{ color: "var(--text-muted)" }}>
              Satış tamamen ödenmediyse iade önce müşterinin borcunu düşürür; yalnızca fazla ödenen kısım iade edilir.
            </small>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sr-reason">İade nedeni *</label>
            <input id="sr-reason" className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "İadeyi kaydet"}</button>
          </div>
        </form>
      ) : returnable.length > 0 ? (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>İade al</button>
      ) : rows ? (
        <p>İade edilebilecek kalem kalmadı.</p>
      ) : null}

      {returns && returns.length > 0 ? (
        <ul className="menu-list" aria-label="İadeler">
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
                {formatDateTime(r.return_date)} · {r.refund_method === "CUSTOMER_CREDIT" ? "Müşteri alacağı" : PAYMENT_METHOD_LABELS[r.refund_method as PaymentMethod] ?? r.refund_method}
                {r.reason ? ` · ${r.reason}` : ""}
              </small>
              {r.status === "POSTED" ? (
                reversing === r.id ? (
                  <div className="stack stack-sm">
                    <input className="form-input" placeholder="Geri alma nedeni *" aria-label="Geri alma nedeni" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
                    {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
                    <div className="row row-gap-md">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReversing(null)} disabled={busy}>Vazgeç</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => reverse(r.id)} disabled={busy}>İadeyi geri al</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => { setError(null); setReversing(r.id); }}>
                    Hatalı iade: geri al
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
