"use client";

import { OfflineStockNotice } from "@/components/layout/OfflineStockNotice";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useServiceContext } from "@/hooks/useServiceContext";
import { useStockBalances } from "@/hooks/useStock";
import { CustomerPicker } from "@/components/customers/CustomerPicker";
import { ProductPicker } from "@/components/products/ProductPicker";
import { SerialUnitSelect } from "@/components/products/SerialUnitSelect";
import { parseMoneyInput, parseQuantityInput } from "@/lib/calc";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/service";
import {
  NegativeStockReasonRequiredError,
  createSale,
  finalizeSale,
  updateDraftSale,
  type SaleInput,
} from "@/lib/sales/service";
import { computeSaleTotals } from "@/lib/sales/totals";
import { formatCurrency, formatQuantity, todayLocalDate } from "@/lib/utils";
import type { Sale, SaleItem } from "@/lib/db";
import type { PaymentMethod, Product, TaxMode } from "@/types";

type DraftLine = {
  key: string;
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  price: string;
  discount: string;
  taxMode: TaxMode;
  taxRate: string;
  /** Makine satışı: satılacak stoktaki birim */
  isSerial: boolean;
  serialUnitId: string;
};

const fieldMoney = (tl: number) => tl.toFixed(2).replace(".", ",");
let keySeq = 0;
const nextKey = () => `s${++keySeq}`;

function fromItems(items: SaleItem[]): DraftLine[] {
  return items.map((i) => ({
    key: nextKey(),
    productId: i.product_id ?? "",
    name: i.description_snapshot,
    unit: i.unit,
    quantity: String(i.quantity).replace(".", ","),
    price: fieldMoney(i.unit_price_snapshot),
    // Belge indirimi satırlara yazıldığından taslak düzenlemede satır indirimi olarak görünür.
    discount: i.discount_amount > 0 ? fieldMoney(i.discount_amount) : "",
    taxMode: i.tax_mode as TaxMode,
    taxRate: String(i.tax_rate).replace(".", ","),
    isSerial: !!i.serial_unit_id,
    serialUnitId: i.serial_unit_id ?? "",
  }));
}

type ParsedLine =
  | { ok: true; quantity: number; unitPriceKurus: number; discountKurus: number; taxRate: number }
  | { ok: false; error: string };

function parseLine(line: DraftLine): ParsedLine {
  const quantity = parseQuantityInput(line.quantity);
  const unitPriceKurus = parseMoneyInput(line.price);
  const discountKurus = line.discount.trim() === "" ? 0 : parseMoneyInput(line.discount);
  const taxRate = parseQuantityInput(line.taxRate);
  if (quantity === null || quantity <= 0) return { ok: false, error: `“${line.name}”: miktar sıfırdan büyük olmalıdır.` };
  if (unitPriceKurus === null) return { ok: false, error: `“${line.name}”: birim fiyat geçersiz.` };
  if (discountKurus === null) return { ok: false, error: `“${line.name}”: indirim geçersiz.` };
  if (taxRate === null || taxRate > 100) return { ok: false, error: `“${line.name}”: KDV oranı 0-100 olmalıdır.` };
  return { ok: true, quantity, unitPriceKurus, discountKurus, taxRate };
}

/**
 * Satış formu (Adım 4.1-4.2): ürünleri ekle, indirim uygula, müşteri (isteğe
 * bağlı) ve ödeme gir. "Satışı tamamla" tek adımda kesinleştirir; taslak olarak da kaydedilebilir.
 */
export function SaleForm({
  sale,
  items = [],
  initialCustomerId = "",
  onDone,
}: {
  sale?: Sale;
  items?: SaleItem[];
  initialCustomerId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const ctx = useServiceContext();
  const balances = useStockBalances();

  const [customerId, setCustomerId] = useState(sale?.customer_id ?? initialCustomerId);
  const [date, setDate] = useState(sale ? sale.sale_date.slice(0, 10) : todayLocalDate());
  const [notes, setNotes] = useState(sale?.notes ?? "");
  const [dueDate, setDueDate] = useState(sale?.due_date ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() => fromItems(items));
  const [docDiscount, setDocDiscount] = useState("");
  const [pickerKey, setPickerKey] = useState(0);
  const [received, setReceived] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [needsReason, setNeedsReason] = useState(false);
  const [negativeReason, setNegativeReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function addProduct(product: Product) {
    setLines((current) => [
      ...current,
      {
        key: nextKey(),
        productId: product.id,
        name: product.name,
        unit: product.unit,
        quantity: "1",
        price: fieldMoney(product.default_sale_price),
        discount: "",
        taxMode: product.default_tax_mode,
        taxRate: String(product.default_tax_rate).replace(".", ","),
        isSerial: product.is_serial_tracked,
        serialUnitId: "",
      },
    ]);
    setPickerKey((k) => k + 1);
  }

  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Canlı toplam: servisle aynı hesap fonksiyonu.
  const parsed = lines.map(parseLine);
  const lineError = parsed.find((p) => !p.ok);
  const docDiscountKurus = docDiscount.trim() === "" ? 0 : parseMoneyInput(docDiscount);
  let totalKurus = 0;
  let totalError: string | null = null;
  if (lines.length > 0 && !lineError && docDiscountKurus !== null) {
    try {
      const ok = parsed as Extract<ParsedLine, { ok: true }>[];
      totalKurus = computeSaleTotals(
        ok.map((p, i) => ({
          quantity: p.quantity,
          unitPriceKurus: p.unitPriceKurus,
          discountKurus: p.discountKurus,
          taxMode: lines[i].taxMode,
          taxRate: p.taxRate,
        })),
        docDiscountKurus
      ).totals.total;
    } catch (e) {
      totalError = e instanceof Error ? e.message : "Tutar hesaplanamadı.";
    }
  }

  const receivedKurus = received.trim() === "" ? 0 : parseMoneyInput(received);
  const unpaidKurus = Math.max(totalKurus - (receivedKurus ?? 0), 0);

  function buildInput(): SaleInput | string {
    if (lines.length === 0) return "En az bir ürün ekleyin.";
    if (lineError && !lineError.ok) return lineError.error;
    if (docDiscountKurus === null) return "Belge indirimi geçerli bir tutar olmalıdır.";
    if (totalError) return totalError;
    const noUnit = lines.find((l) => l.isSerial && !l.serialUnitId);
    if (noUnit) return `“${noUnit.name}” için satılacak birimi seçin.`;
    if (lines.some((l) => l.isSerial) && !customerId) return "Makine satışı için müşteri seçin.";
    const ok = parsed as Extract<ParsedLine, { ok: true }>[];
    return {
      customerId: customerId || undefined,
      saleDate: date,
      notes,
      dueDate: dueDate || undefined,
      documentDiscountKurus: docDiscountKurus,
      lines: lines.map((l, i) => ({
        productId: l.productId,
        quantity: ok[i].quantity,
        unitPriceKurus: ok[i].unitPriceKurus,
        discountKurus: ok[i].discountKurus,
        taxMode: l.taxMode,
        taxRate: ok[i].taxRate,
        serialUnitId: l.isSerial ? l.serialUnitId : undefined,
      })),
    };
  }

  async function submit(finalize: boolean) {
    setError(null);
    const input = buildInput();
    if (typeof input === "string") return setError(input);
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    let payment: { amountKurus: number; method: PaymentMethod } | undefined;
    if (finalize && received.trim() !== "") {
      if (receivedKurus === null || receivedKurus <= 0) return setError("Alınan tutar sıfırdan büyük geçerli bir tutar olmalıdır.");
      payment = { amountKurus: receivedKurus, method };
    }
    if (finalize && unpaidKurus > 0 && !customerId) {
      return setError("Tahsil edilmeyen tutar var: veresiye satış için müşteri seçin ya da tutarı tahsil edin.");
    }

    setBusy(true);
    try {
      let saved: Sale;
      const reason = needsReason ? negativeReason : undefined;
      if (sale) {
        saved = await updateDraftSale(ctx, sale.id, input);
        if (finalize) saved = await finalizeSale(ctx, sale.id, { payment, negativeStockReason: reason });
      } else {
        saved = await createSale(ctx, input, { finalize, payment, negativeStockReason: reason });
      }
      if (onDone) onDone();
      else router.push(`/sales/${saved.id}`);
    } catch (e) {
      if (e instanceof NegativeStockReasonRequiredError) setNeedsReason(true);
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setBusy(false);
    }
  }

  return (
    <form
      className="stack stack-md"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      noValidate
    >
      <OfflineStockNotice />
      <ProductPicker key={pickerKey} value="" onChange={addProduct} label="Ürün ekle" includeSerial />

      {lines.length > 0 ? (
        <ul className="menu-list" aria-label="Satış satırları">
          {lines.map((l, i) => {
            const p = parsed[i];
            const available = balances?.get(l.productId)?.available ?? 0;
            const short = !l.isSerial && p.ok && p.quantity > available;
            return (
              <li key={l.key} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
                <span className="row row-between">
                  <strong>{l.name}</strong>
                  <span className="badge badge-gray">Stok: {formatQuantity(available)} {l.unit}</span>
                </span>
                {l.isSerial ? (
                  <SerialUnitSelect productId={l.productId} value={l.serialUnitId} onChange={(id) => update(l.key, { serialUnitId: id, quantity: "1" })} />
                ) : null}
                {short ? <span className="badge badge-red" role="status">Stok yetersiz</span> : null}
                <span className="row row-gap-sm">
                  <label className="form-group" style={{ flex: 1 }}>
                    <span className="form-label">Miktar</span>
                    <input className="form-input" inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} disabled={l.isSerial} />
                  </label>
                  <label className="form-group" style={{ flex: 1 }}>
                    <span className="form-label">Birim fiyat (₺)</span>
                    <input className="form-input" inputMode="decimal" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} />
                  </label>
                  <label className="form-group" style={{ flex: 1 }}>
                    <span className="form-label">İndirim (₺)</span>
                    <input className="form-input" inputMode="decimal" value={l.discount} onChange={(e) => update(l.key, { discount: e.target.value })} />
                  </label>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setLines((c) => c.filter((x) => x.key !== l.key))}>
                  Satırı kaldır
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>Henüz ürün yok. Yukarıdan ürün arayıp ekleyin.</p>
      )}

      <div className="form-group">
        <label className="form-label" htmlFor="sl-docdisc">Belge indirimi (₺, tüm satışa)</label>
        <input id="sl-docdisc" className="form-input" inputMode="decimal" placeholder="0,00" value={docDiscount} onChange={(e) => setDocDiscount(e.target.value)} />
      </div>

      <div className="tile">
        <div className="tile-label">Satış toplamı</div>
        <div className="tile-value">{formatCurrency(totalKurus / 100)}</div>
      </div>
      {totalError ? <div className="alert alert-error" role="alert">{totalError}</div> : null}

      <CustomerPicker
        value={customerId}
        onChange={setCustomerId}
        onClear={() => setCustomerId("")}
        required={false}
        label="Müşteri (veresiye için gerekli)"
      />

      <fieldset className="stack stack-sm" style={{ border: 0, padding: 0 }}>
        <legend className="form-label">Ödeme</legend>
        <div className="row row-gap-md">
          <div className="form-group" style={{ flex: 2 }}>
            <input className="form-input" inputMode="decimal" placeholder="Alınan tutar (₺)" aria-label="Alınan tutar" value={received} onChange={(e) => setReceived(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <select className="form-input" aria-label="Ödeme yöntemi" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setReceived(fieldMoney(totalKurus / 100))} disabled={totalKurus === 0}>
          Tamamı peşin: {formatCurrency(totalKurus / 100)}
        </button>
        {unpaidKurus > 0 && totalKurus > 0 ? (
          <div className={`alert ${customerId ? "alert-warning" : "alert-error"}`} role="status">
            {customerId
              ? `Veresiye: ${formatCurrency(unpaidKurus / 100)} müşterinin borcuna yazılacak.`
              : `Tahsil edilmeyen ${formatCurrency(unpaidKurus / 100)} var: veresiye için müşteri seçin ya da tutarı tahsil edin.`}
          </div>
        ) : null}
        {unpaidKurus > 0 && totalKurus > 0 && customerId ? (
          <div className="form-group">
            <label className="form-label" htmlFor="sl-due">Vade tarihi (isteğe bağlı)</label>
            <input id="sl-due" className="form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <small style={{ color: "var(--text-muted)" }}>Girilirse vade gününde ve 7 gün gecikince hatırlatılır.</small>
          </div>
        ) : null}
      </fieldset>

      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="sl-date">Satış tarihi</label>
          <input id="sl-date" className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: 2 }}>
          <label className="form-label" htmlFor="sl-notes">Not</label>
          <input id="sl-notes" className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {needsReason ? (
        <div className="form-group">
          <label className="form-label" htmlFor="sl-reason">Eksi stok nedeni *</label>
          <input id="sl-reason" className="form-input" placeholder="Ör. mal yolda, müşteri bekliyor" value={negativeReason} onChange={(e) => setNegativeReason(e.target.value)} autoFocus />
        </div>
      ) : null}

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      <div className="stack stack-sm">
        <button type="button" className="btn btn-primary btn-full btn-lg" disabled={busy} onClick={() => void submit(true)}>
          {busy ? "Kaydediliyor…" : "Satışı tamamla"}
        </button>
        <button type="submit" className="btn btn-secondary btn-full" disabled={busy}>
          Taslak olarak kaydet
        </button>
        {onDone ? (
          <button type="button" className="btn btn-ghost btn-full" onClick={onDone} disabled={busy}>
            Vazgeç
          </button>
        ) : null}
      </div>
    </form>
  );
}
