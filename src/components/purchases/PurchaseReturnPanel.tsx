"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Purchase, PurchaseItem } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/service";
import { reverseReturn } from "@/lib/returns/service";
import {
  createPurchaseReturn,
  getPurchaseReturns,
  getReturnablePurchaseQuantity,
  type SupplierRefundMethod,
} from "@/lib/returns/purchase";
import { unitLabel } from "@/lib/serial/service";
import { formatCurrency, formatDateTime, formatQuantity } from "@/lib/utils";
import type { PaymentMethod, ProductSerialUnit, StockBucket } from "@/types";

type Row = { item: PurchaseItem; remaining: number; serial: boolean; units: ProductSerialUnit[] };

/** Tedarikçiye iade: kalem ve miktar (seri takipliyse birim) seçilir; stok kovası ve para iadesi açıkça belirtilir (Adım 5.6). */
export function PurchaseReturnPanel({ purchase }: { purchase: Purchase }) {
  const ctx = useBusinessContext();
  const rows = useLiveQuery(async (): Promise<Row[]> => {
    const items = await db.purchase_items.where("purchase_id").equals(purchase.id).toArray();
    const out: Row[] = [];
    for (const item of items.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const product = item.product_id ? await db.products.get(item.product_id) : undefined;
      const serial = !!product?.is_serial_tracked;
      const units = serial
        ? await db.product_serial_units.where("purchase_item_id").equals(item.id).toArray()
        : [];
      out.push({ item, remaining: await getReturnablePurchaseQuantity(item), serial, units });
    }
    return out;
  }, [purchase.id]);
  const returns = useLiveQuery(() => getPurchaseReturns(purchase.id), [purchase.id]);

  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [bucket, setBucket] = useState<Record<string, StockBucket>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [method, setMethod] = useState<SupplierRefundMethod>("SUPPLIER_CREDIT");
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
    for (const { item, remaining, serial, units } of returnable) {
      const b = bucket[item.id] ?? "AVAILABLE";
      if (serial) {
        const serialUnitIds = units.filter((u) => picked[u.id]).map((u) => u.id);
        if (serialUnitIds.length > 0) lines.push({ purchaseItemId: item.id, bucket: b, serialUnitIds });
        continue;
      }
      const raw = (qty[item.id] ?? "").trim().replace(",", ".");
      if (raw === "") continue;
      const quantity = Number(raw);
      if (!Number.isFinite(quantity) || quantity <= 0) return setError("İade miktarı sıfırdan büyük bir sayı olmalıdır.");
      if (quantity > remaining) return setError(`“${item.description_snapshot}” için en fazla ${formatQuantity(remaining)} iade edilebilir.`);
      lines.push({ purchaseItemId: item.id, quantity, bucket: b });
    }
    if (lines.length === 0) return setError("İade edilecek kalemi seçin.");
    setBusy(true);
    try {
      await createPurchaseReturn(ctx, { purchaseId: purchase.id, reason, refundMethod: method, lines });
      setOpen(false);
      setQty({});
      setPicked({});
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
    <section className="card stack stack-md" aria-labelledby="pr-title">
      <h2 id="pr-title">Tedarikçiye iade</h2>

      {open ? (
        <form className="stack stack-md" onSubmit={submit} noValidate>
          {returnable.map(({ item, remaining, serial, units }) => (
            <div key={item.id} className="stack stack-sm">
              <strong>{item.description_snapshot}</strong>
              <small style={{ color: "var(--text-muted)" }}>
                Alınan {formatQuantity(item.quantity)} {item.unit} · iade edilebilir {formatQuantity(remaining)}
              </small>
              {serial ? (
                <ul className="menu-list" aria-label="İade edilecek birimler">
                  {units
                    .filter((u) => u.status === "IN_STOCK" || u.status === "DAMAGED")
                    .map((u) => (
                      <li key={u.id} style={{ padding: "6px 0" }}>
                        <label className="row row-gap-md" style={{ alignItems: "center" }}>
                          <input type="checkbox" checked={!!picked[u.id]} onChange={(e) => setPicked({ ...picked, [u.id]: e.target.checked })} />
                          <span>{unitLabel(u)}{u.status === "DAMAGED" ? " (hasarlı)" : ""}</span>
                        </label>
                      </li>
                    ))}
                </ul>
              ) : (
                <input
                  className="form-input"
                  inputMode="decimal"
                  placeholder="İade miktarı"
                  aria-label={`${item.description_snapshot} iade miktarı`}
                  value={qty[item.id] ?? ""}
                  onChange={(e) => setQty({ ...qty, [item.id]: e.target.value })}
                />
              )}
              <select
                className="form-input"
                aria-label={`${item.description_snapshot} stok kovası`}
                value={bucket[item.id] ?? "AVAILABLE"}
                onChange={(e) => setBucket({ ...bucket, [item.id]: e.target.value as StockBucket })}
              >
                <option value="AVAILABLE">Satılabilir stoktan çıkar</option>
                <option value="DAMAGED">Hasarlı stoktan çıkar</option>
              </select>
            </div>
          ))}
          <div className="form-group">
            <label className="form-label" htmlFor="pr-method">Tedarikçiden para</label>
            <select id="pr-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as SupplierRefundMethod)}>
              <option value="SUPPLIER_CREDIT">Para almadım, borcumdan düş</option>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]} ile geri aldım</option>
              ))}
            </select>
            <small style={{ color: "var(--text-muted)" }}>
              İade önce tedarikçiye olan borcunuzu düşürür; yalnızca alıma fazladan ödediğiniz kısım geri alınmış sayılır.
            </small>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="pr-reason">İade nedeni *</label>
            <input id="pr-reason" className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "İadeyi kaydet"}</button>
          </div>
        </form>
      ) : returnable.length > 0 ? (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>Tedarikçiye iade et</button>
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
                {formatDateTime(r.return_date)} · {r.refund_method === "SUPPLIER_CREDIT" ? "Borçtan düşüldü" : PAYMENT_METHOD_LABELS[r.refund_method as PaymentMethod] ?? r.refund_method}
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
