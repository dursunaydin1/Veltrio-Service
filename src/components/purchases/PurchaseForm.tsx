"use client";

import { useState } from "react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { ProductPicker } from "@/components/products/ProductPicker";
import { SupplierPicker } from "@/components/suppliers/SupplierPicker";
import { QuantityStepper } from "@/components/common/QuantityStepper";
import { calcLine, parseMoneyInput, parseQuantityInput } from "@/lib/calc";
import {
  createPurchase,
  receivePurchase,
  updateDraftPurchase,
  type PurchaseInput,
} from "@/lib/purchases/service";
import { formatCurrency, moneyInput, todayLocalDate } from "@/lib/utils";
import type { Purchase, PurchaseItem } from "@/lib/db";
import type { PaymentMethod, Product, TaxMode } from "@/types";
import { useAppNav } from "@/lib/nav/useAppNav";
import { OptionalField, OptionalGroup } from "@/components/common/OptionalField";
import { NO_CONTEXT_MESSAGE, errorMessage } from "@/lib/errors/message";
import { PaymentMethodPicker } from "@/components/common/PaymentMethodPicker";

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
  /** Seri takipli ürün: her satıra bir seri numarası (boş satır = iç numara) */
  isSerial: boolean;
  serial: string;
};

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;

function fromItems(items: PurchaseItem[]): DraftLine[] {
  return items.map((i) => ({
    key: nextKey(),
    productId: i.product_id ?? "",
    name: i.description_snapshot,
    unit: i.unit,
    quantity: String(i.quantity).replace(".", ","),
    price: moneyInput(i.unit_price),
    discount: i.line_discount > 0 ? moneyInput(i.line_discount) : "",
    taxMode: i.tax_mode as TaxMode,
    taxRate: String(i.tax_rate).replace(".", ","),
    isSerial: Array.isArray(i.serial_numbers),
    serial: (i.serial_numbers ?? []).join("\n"),
  }));
}

type Parsed = { ok: true; total: number } | { ok: false; error: string };

/** Satırın vergi dahil toplamını (kuruş) hesaplar; geçersizse nedenini döner. */
function lineTotal(line: DraftLine): Parsed {
  const qty = parseQuantityInput(line.quantity);
  const price = parseMoneyInput(line.price);
  const discount = line.discount.trim() === "" ? 0 : parseMoneyInput(line.discount);
  const rate = parseQuantityInput(line.taxRate);
  if (qty === null || qty <= 0) return { ok: false, error: `“${line.name}”: miktar sıfırdan büyük olmalıdır.` };
  if (line.isSerial && !Number.isInteger(qty)) return { ok: false, error: `“${line.name}” seri takipli: miktar tam sayı olmalıdır.` };
  if (price === null) return { ok: false, error: `“${line.name}”: birim fiyat geçersiz.` };
  if (discount === null) return { ok: false, error: `“${line.name}”: indirim geçersiz.` };
  if (rate === null || rate > 100) return { ok: false, error: `“${line.name}”: KDV oranı 0-100 olmalıdır.` };
  try {
    return { ok: true, total: calcLine({ unitPrice: price, quantity: qty, discount, taxMode: line.taxMode, taxRate: rate }).total };
  } catch (e) {
    return { ok: false, error: `“${line.name}”: ${errorMessage(e, "tutar hesaplanamadı")}` };
  }
}

/**
 * Satın alma formu (Adım 4.6): ayrıntılı (ürün satırları) ya da hızlı (yalnızca
 * toplam) alım; taslak kaydedilir veya doğrudan teslim alınır.
 */
export function PurchaseForm({
  purchase,
  items = [],
  initialSupplierId = "",
  onDone,
}: {
  purchase?: Purchase;
  items?: PurchaseItem[];
  initialSupplierId?: string;
  onDone?: () => void;
}) {
  // Kaydedince form geçmişten çıkar; geri hareketi formu yeniden açmaz (K-076)
  const nav = useAppNav();
  const ctx = useBusinessContext();

  const [supplierId, setSupplierId] = useState(purchase?.supplier_id ?? initialSupplierId);
  const [date, setDate] = useState(purchase ? purchase.purchase_date.slice(0, 10) : todayLocalDate());
  const [supplierRef, setSupplierRef] = useState(purchase?.supplier_ref ?? "");
  const [notes, setNotes] = useState(purchase?.notes ?? "");
  const [quick, setQuick] = useState(!!purchase && items.length === 0);
  const [manualTotal, setManualTotal] = useState(purchase && items.length === 0 ? moneyInput(purchase.total_amount) : "");
  const [lines, setLines] = useState<DraftLine[]>(() => fromItems(items));
  const [pickerKey, setPickerKey] = useState(0);
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
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
        price: product.last_purchase_price ? moneyInput(product.last_purchase_price) : "",
        discount: "",
        taxMode: product.default_tax_mode,
        taxRate: String(product.default_tax_rate).replace(".", ","),
        isSerial: product.is_serial_tracked,
        serial: "",
      },
    ]);
    setPickerKey((k) => k + 1);
  }

  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const totals = lines.map(lineTotal);
  const sumKurus = totals.reduce((acc, t) => acc + (t.ok ? t.total : 0), 0);
  const manualKurus = parseMoneyInput(manualTotal);
  const grand = quick ? (manualKurus ?? 0) : sumKurus;

  function buildInput(): PurchaseInput | string {
    if (!supplierId) return "Tedarikçi seçin.";
    if (quick) {
      if (manualKurus === null || manualKurus <= 0) return "Toplam tutar sıfırdan büyük geçerli bir tutar olmalıdır.";
      return { supplierId, purchaseDate: date, supplierRef, notes, lines: [], manualTotalKurus: manualKurus };
    }
    if (lines.length === 0) return "En az bir ürün satırı ekleyin ya da “yalnızca toplam tutar” seçeneğini kullanın.";
    for (const t of totals) if (!t.ok) return t.error;
    return {
      supplierId,
      purchaseDate: date,
      supplierRef,
      notes,
      lines: lines.map((l) => ({
        productId: l.productId,
        quantity: parseQuantityInput(l.quantity) as number,
        unitPriceKurus: parseMoneyInput(l.price) as number,
        discountKurus: l.discount.trim() === "" ? 0 : (parseMoneyInput(l.discount) as number),
        taxMode: l.taxMode,
        taxRate: parseQuantityInput(l.taxRate) as number,
        serialNumbers: l.isSerial ? l.serial.split("\n").map((x) => x.trim()) : undefined,
      })),
    };
  }

  async function submit(receive: boolean) {
    setError(null);
    const input = buildInput();
    if (typeof input === "string") return setError(input);
    if (!ctx) return setError(NO_CONTEXT_MESSAGE);

    let payment: { amountKurus: number; method: PaymentMethod } | undefined;
    if (receive && paid.trim() !== "") {
      const kurus = parseMoneyInput(paid);
      if (kurus === null || kurus <= 0) return setError("Ödenen tutar sıfırdan büyük geçerli bir tutar olmalıdır.");
      payment = { amountKurus: kurus, method };
    }

    setBusy(true);
    try {
      let saved: Purchase;
      if (purchase) {
        saved = await updateDraftPurchase(ctx, purchase.id, input);
        if (receive) saved = await receivePurchase(ctx, purchase.id, payment);
      } else {
        saved = await createPurchase(ctx, input, { receive, payment });
      }
      if (onDone) onDone();
      else nav.replace(`/purchases/${saved.id}`);
    } catch (e) {
      setError(errorMessage(e, "Kaydedilemedi."));
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
      <SupplierPicker value={supplierId} onChange={setSupplierId} />

      <OptionalGroup>
        <OptionalField label="Fatura / irsaliye no" chip="Fatura no" htmlFor="pu-ref" filled={!!supplierRef} onClear={() => setSupplierRef("")}>
          <input id="pu-ref" className="form-input" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
        </OptionalField>
        <OptionalField label="Alım tarihi" chip="Farklı tarih" htmlFor="pu-date" filled={date !== todayLocalDate()} onClear={() => setDate(todayLocalDate())}>
          <input id="pu-date" className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </OptionalField>
      </OptionalGroup>

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} />
        Hızlı alım: yalnızca toplam tutar (ürün satırı yok)
      </label>

      {quick ? (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor="pu-total">Toplam tutar (₺) *</label>
            <input id="pu-total" className="form-input" inputMode="decimal" placeholder="0,00" value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} />
          </div>
          <div className="alert alert-warning" role="note">
            Stok girişi yapılmayacak: yalnızca toplam tutarı olan alım stok miktarını değiştirmez, sadece tedarikçi borcuna yazılır.
          </div>
        </>
      ) : (
        <section className="stack stack-md" aria-label="Ürün satırları">
          <ProductPicker key={pickerKey} value="" onChange={addProduct} label="Ürün ekle" includeSerial />

          {lines.length > 0 ? (
            <ul className="menu-list" aria-label="Alım satırları">
              {lines.map((l, i) => (
                <li key={l.key} className="stack stack-sm" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
                  <span className="row row-between">
                    <strong>{l.name}</strong>
                    <span>{totals[i].ok ? formatCurrency(totals[i].total / 100) : "—"}</span>
                  </span>
                  <span className="row row-gap-sm">
                    {/* label değil: içindeki − düğmesine dokunuşu aktarmasın */}
                    <div className="form-group" style={{ flex: "0 0 auto" }}>
                      <span className="form-label">Miktar ({l.unit})</span>
                      <QuantityStepper label={`${l.name}: miktar`} value={l.quantity} onChange={(quantity) => update(l.key, { quantity })} />
                    </div>
                    <label className="form-group" style={{ flex: 1 }}>
                      <span className="form-label">Birim fiyat (₺)</span>
                      <input className="form-input" inputMode="decimal" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} />
                    </label>
                  </span>
                  <span className="row row-gap-sm">
                    <label className="form-group" style={{ flex: 1 }}>
                      <span className="form-label">İndirim (₺)</span>
                      <input className="form-input" inputMode="decimal" value={l.discount} onChange={(e) => update(l.key, { discount: e.target.value })} />
                    </label>
                    <label className="form-group" style={{ flex: 1 }}>
                      <span className="form-label">KDV</span>
                      <select className="form-input" value={l.taxMode} onChange={(e) => update(l.key, { taxMode: e.target.value as TaxMode })}>
                        <option value="INCLUSIVE">KDV dahil</option>
                        <option value="EXCLUSIVE">KDV hariç</option>
                        <option value="NONE">KDV yok</option>
                      </select>
                    </label>
                    {l.taxMode !== "NONE" ? (
                      <label className="form-group" style={{ flex: 1 }}>
                        <span className="form-label">Oran (%)</span>
                        <input className="form-input" inputMode="decimal" value={l.taxRate} onChange={(e) => update(l.key, { taxRate: e.target.value })} />
                      </label>
                    ) : null}
                  </span>
                  {l.isSerial ? (
                    <label className="form-group">
                      <span className="form-label">Seri numaraları (her satıra bir tane; boş bırakılan birim iç numarayla tanınır)</span>
                      <textarea className="form-input" rows={Math.min(Math.max(Number(l.quantity) || 1, 2), 6)} value={l.serial} onChange={(e) => update(l.key, { serial: e.target.value })} />
                    </label>
                  ) : null}
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setLines((c) => c.filter((x) => x.key !== l.key))}>
                    Satırı kaldır
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Henüz ürün satırı yok. Yukarıdan ürün arayıp ekleyin.</p>
          )}
        </section>
      )}

      {/* Satır yokken toplam ve ödeme gösterilmez (K-099); hızlı alımda toplam zaten yukarıda yazılır */}
      {!quick && lines.length > 0 ? (
        <div className="tile">
          <div className="tile-label">Alım toplamı</div>
          <div className="tile-value">{formatCurrency(grand / 100)}</div>
        </div>
      ) : null}

      <OptionalGroup>
        <OptionalField label="Not" htmlFor="pu-notes" filled={!!notes} onClear={() => setNotes("")}>
          <input id="pu-notes" className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </OptionalField>
      </OptionalGroup>

      {quick || lines.length > 0 ? (
        <fieldset className="stack stack-sm" style={{ border: 0, padding: 0 }}>
          <legend className="form-label">Teslim alırken yapılan ödeme (isteğe bağlı)</legend>
          <div className="form-group">
            <input className="form-input" inputMode="decimal" placeholder="Ödenen tutar (₺)" aria-label="Ödenen tutar" value={paid} onChange={(e) => setPaid(e.target.value)} />
          </div>
          <PaymentMethodPicker value={method} onChange={setMethod} />
        </fieldset>
      ) : null}

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      <div className="stack stack-sm">
        <button type="button" className="btn btn-primary btn-full btn-lg" disabled={busy} onClick={() => void submit(true)}>
          {busy ? "Kaydediliyor…" : "Teslim al ve kaydet"}
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
