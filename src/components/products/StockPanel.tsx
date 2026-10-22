"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useProductBalance, useStockContext } from "@/hooks/useStock";
import { parseMoneyInput, parseQuantityInput } from "@/lib/calc";
import { unitLabel } from "@/lib/products/constants";
import { isCriticalStock } from "@/lib/products/stock";
import { MOVEMENT_LABELS } from "@/lib/stock/labels";
import { addStock, adjustStock } from "@/lib/stock/service";
import { formatDateTime, formatNumber } from "@/lib/utils";
import type { Product } from "@/types";

type Mode = "entry" | "adjust" | null;

/** Ürün sayfasındaki stok bölümü: bakiye, giriş, düzeltme ve hareket geçmişi (Adım 2.3, 2.6, 2.9). */
export function StockPanel({ product }: { product: Product }) {
  const ctx = useStockContext();
  const balance = useProductBalance(product.id);
  const [mode, setMode] = useState<Mode>(null);

  const movements = useLiveQuery(
    async () => {
      const all = await db.stock_movements.where("product_id").equals(product.id).toArray();
      return all.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);
    },
    [product.id]
  );

  const unit = unitLabel(product.unit);
  const critical = isCriticalStock({
    stock_available: balance.available,
    critical_stock_level: product.critical_stock_level,
  });

  return (
    <section className="card stack stack-md" aria-labelledby="stock-title">
      <h2 id="stock-title">Stok</h2>

      <div className="tile-grid">
        <div className="tile">
          <div className="tile-label">Satılabilir</div>
          <div className="tile-value">
            {formatNumber(balance.available)} <small>{unit}</small>
          </div>
          {critical ? <span className="badge badge-red">Kritik stok</span> : null}
          {balance.available < 0 ? <span className="badge badge-red">Eksi stok</span> : null}
        </div>
        <div className="tile">
          <div className="tile-label">Hasarlı</div>
          <div className="tile-value">
            {formatNumber(balance.damaged)} <small>{unit}</small>
          </div>
        </div>
      </div>

      {product.is_serial_tracked ? (
        <div className="alert alert-warning" role="note">
          Seri takipli ürünlerin stoğu birim kayıtlarıyla yönetilir (yakında).
        </div>
      ) : mode === null ? (
        <div className="row row-gap-md">
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => setMode("entry")}>
            Stok girişi
          </button>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode("adjust")}>
            Stok düzelt
          </button>
        </div>
      ) : mode === "entry" ? (
        <EntryForm product={product} onDone={() => setMode(null)} ctx={ctx} />
      ) : (
        <AdjustForm product={product} current={balance.available} onDone={() => setMode(null)} ctx={ctx} />
      )}

      <h3>Hareket geçmişi</h3>
      {movements === undefined ? null : movements.length === 0 ? (
        <p>Henüz stok hareketi yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Stok hareketleri">
          {movements.map((m) => (
            <li key={m.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
              <span className="row row-between">
                <strong>{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</strong>
                <strong style={{ color: m.quantity < 0 ? "var(--accent-danger)" : "var(--accent-success)" }}>
                  {m.quantity > 0 ? "+" : ""}
                  {formatNumber(m.quantity)} {unit}
                  {m.bucket === "DAMAGED" ? " (hasarlı)" : ""}
                </strong>
              </span>
              <small style={{ color: "var(--text-muted)" }}>
                {formatDateTime(m.created_at)}
                {m.note ? ` · ${m.note}` : ""}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type FormProps = {
  product: Product;
  ctx: ReturnType<typeof useStockContext>;
  onDone: () => void;
};

function EntryForm({ product, ctx, onDone }: FormProps) {
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const qty = parseQuantityInput(quantity);
    if (qty === null || qty <= 0) return setError("Giriş miktarı sıfırdan büyük bir sayı olmalıdır.");
    const costKurus = cost.trim() === "" ? undefined : parseMoneyInput(cost);
    if (costKurus === null) return setError("Birim maliyet geçerli bir tutar olmalıdır.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    setBusy(true);
    try {
      await addStock(ctx, {
        productId: product.id,
        quantity: qty,
        unitCost: costKurus === undefined ? undefined : costKurus / 100,
        note,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stok girişi yapılamadı.");
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>Stok girişi (açılış stoğu / elle giriş)</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="entry-qty">Miktar ({unitLabel(product.unit)}) *</label>
        <input id="entry-qty" className="form-input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="entry-cost">Birim maliyet (₺)</label>
        <input id="entry-cost" className="form-input" inputMode="decimal" placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="entry-note">Not</label>
        <input id="entry-note" className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? "Kaydediliyor…" : "Girişi kaydet"}
        </button>
      </div>
    </form>
  );
}

function AdjustForm({ product, current, ctx, onDone }: FormProps & { current: number }) {
  const [newQty, setNewQty] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = parseQuantityInput(newQty);
  const diff = parsed === null ? null : Math.round((parsed - current) * 10_000) / 10_000;
  const unit = unitLabel(product.unit);

  function review(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (parsed === null) return setError("Yeni miktar geçerli bir sayı olmalıdır.");
    if (diff === 0) return setError("Yeni miktar mevcut stokla aynı; düzeltme gerekmiyor.");
    if (!reason.trim()) return setError("Düzeltme nedeni zorunludur.");
    setConfirming(true);
  }

  async function confirm() {
    if (!ctx || parsed === null) return;
    setBusy(true);
    setError(null);
    try {
      await adjustStock(ctx, { productId: product.id, newQuantity: parsed, reason });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Düzeltme yapılamadı.");
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming && diff !== null && parsed !== null) {
    return (
      <div className="stack stack-md" role="group" aria-label="Düzeltme onayı">
        <h3>Düzeltmeyi onayla</h3>
        <div className="alert alert-warning">
          Stok <strong>{formatNumber(current)}</strong> → <strong>{formatNumber(parsed)}</strong> {unit} (fark:{" "}
          <strong>{diff > 0 ? "+" : ""}{formatNumber(diff)}</strong>)<br />
          Neden: {reason.trim()}
          <br />
          Bu işlem silinemez; yeni bir stok hareketi olarak kaydedilir.
        </div>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        <div className="row row-gap-md">
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirming(false)} disabled={busy}>Geri dön</button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={confirm} disabled={busy}>
            {busy ? "Kaydediliyor…" : "Onayla"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="stack stack-md" onSubmit={review} noValidate>
      <h3>Stok düzeltme</h3>
      <p>
        Önceki miktar: <strong>{formatNumber(current)} {unit}</strong>
        {diff !== null && diff !== 0 ? (
          <> · Fark: <strong>{diff > 0 ? "+" : ""}{formatNumber(diff)}</strong></>
        ) : null}
      </p>
      <div className="form-group">
        <label className="form-label" htmlFor="adj-qty">Yeni miktar ({unit}) *</label>
        <input id="adj-qty" className="form-input" inputMode="decimal" value={newQty} onChange={(e) => setNewQty(e.target.value)} autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="adj-reason">Neden *</label>
        <input id="adj-reason" className="form-input" placeholder="Ör. sayım farkı, fire, hasar" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Devam</button>
      </div>
    </form>
  );
}
