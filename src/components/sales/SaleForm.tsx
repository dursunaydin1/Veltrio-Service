"use client";

import { OfflineStockNotice } from "@/components/layout/OfflineStockNotice";
import { useState } from "react";
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
import { formatCurrency, formatQuantity, moneyInput, todayLocalDate } from "@/lib/utils";
import type { Sale, SaleItem } from "@/lib/db";
import type { PaymentMethod, Product, TaxMode } from "@/types";
import { useAppNav } from "@/lib/nav/useAppNav";
import { OptionalField, OptionalGroup } from "@/components/common/OptionalField";
import { DateQuickPick } from "@/components/common/DateQuickPick";
import { ScanBarcode, X } from "lucide-react";
import { CodeScanner } from "@/components/qr/CodeScanner";
import { haptic } from "@/lib/utils/haptic";
import { parseScan } from "@/lib/qr/payload";
import { findProductByBarcode, normalizeBarcode } from "@/lib/products/service";
import { db } from "@/lib/db";
import { ProductThumb } from "@/components/products/ProductThumb";
import { QuantityStepper, stepQuantity } from "@/components/common/QuantityStepper";

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
  /** Satırda küçük fotoğraf için (K-103); taslaktan açılan satırda olmayabilir */
  photo?: string;
};

let keySeq = 0;
const nextKey = () => `s${++keySeq}`;

function fromItems(items: SaleItem[]): DraftLine[] {
  return items.map((i) => ({
    key: nextKey(),
    productId: i.product_id ?? "",
    name: i.description_snapshot,
    unit: i.unit,
    quantity: String(i.quantity).replace(".", ","),
    price: moneyInput(i.unit_price_snapshot),
    // Belge indirimi satırlara yazıldığından taslak düzenlemede satır indirimi olarak görünür.
    discount: i.discount_amount > 0 ? moneyInput(i.discount_amount) : "",
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
  // Kaydedince form geçmişten çıkar; geri hareketi formu yeniden açmaz (K-076)
  const nav = useAppNav();
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
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<{ ok: boolean; text: string } | null>(null);

  function addProduct(product: Product) {
    setLines((current) => {
      // Aynı ürün yeniden seçilirse yeni satır açılmaz, miktarı bir artar (K-097)
      const same = product.is_serial_tracked ? undefined : current.find((l) => l.productId === product.id);
      if (same) return current.map((l) => (l.key === same.key ? { ...l, quantity: stepQuantity(l.quantity, 1) } : l));
      return [
        ...current,
        {
          key: nextKey(),
          productId: product.id,
          name: product.name,
          unit: product.unit,
          quantity: "1",
          price: moneyInput(product.default_sale_price),
          discount: "",
          taxMode: product.default_tax_mode,
          taxRate: String(product.default_tax_rate).replace(".", ","),
          isSerial: product.is_serial_tracked,
          serialUnitId: "",
          photo: product.photo,
        },
      ];
    });
    setPickerKey((k) => k + 1);
  }

  /** Okutulan barkod / ürün QR'ı: ürün bulunursa satışa eklenir (aynıysa miktar artar) */
  async function addScanned(text: string) {
    if (!ctx) return;
    const qr = parseScan(text);
    let product: Product | undefined;
    if (qr.ok) {
      if (qr.kind !== "product") return setScanNote({ ok: false, text: "Bu bir makine etiketi; ürün barkodu ya da ürün QR'ı okutun." });
      product = await db.products.get(qr.path.split("/").pop() ?? "");
    } else {
      product = await findProductByBarcode(ctx.businessId, text);
    }
    if (!product || product.business_id !== ctx.businessId) {
      return setScanNote({ ok: false, text: `Bu barkod kayıtlı değil (${normalizeBarcode(text)}). Ürünü yukarıdan arayıp ekleyin; ürün sayfasında “Barkodu tanıt” ile bağlarsanız bir dahakine okunur.` });
    }
    if (product.archived_at) return setScanNote({ ok: false, text: `“${product.name}” pasif; satışa eklenemez.` });
    haptic();
    addProduct(product);
    setScanNote({ ok: true, text: `Eklendi: ${product.name}` });
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
      else nav.replace(`/sales/${saved.id}`);
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
      {/* Tezgâhta en hızlı yol (K-102): kutudaki barkod ya da raf QR etiketi okutulur, kamera açık kalır */}
      {scanning ? (
        <div className="card stack stack-sm">
          <CodeScanner label="Barkod ya da QR etiketi" onCode={(text) => void addScanned(text)} />
          {scanNote ? <div className={`alert ${scanNote.ok ? "alert-success" : "alert-warning"}`} role="status">{scanNote.text}</div> : null}
          <button type="button" className="btn btn-secondary btn-full" onClick={() => { setScanning(false); setScanNote(null); }}>Okutma bitti</button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setScanning(true)}>
          <ScanBarcode size={18} aria-hidden="true" /> Barkod okut
        </button>
      )}
      <ProductPicker key={pickerKey} value="" onChange={addProduct} label="Ürün ekle" includeSerial />

      {lines.length > 0 ? (
        <ul className="menu-list" aria-label="Satış satırları">
          {lines.map((l, i) => {
            const p = parsed[i];
            const available = balances?.get(l.productId)?.available ?? 0;
            const short = !l.isSerial && p.ok && p.quantity > available;
            return (
              <li key={l.key} className="sale-line">
                <span className="row row-between" style={{ alignItems: "flex-start", gap: 12 }}>
                  <ProductThumb product={l} size={40} />
                  <span className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                    <strong>{l.name}</strong>
                    <span className="row row-gap-sm">
                      <span className="badge badge-gray">Stok: {formatQuantity(available)} {l.unit}</span>
                      {short ? <span className="badge badge-red" role="status">Stok yetersiz</span> : null}
                    </span>
                  </span>
                  <button type="button" className="icon-btn" aria-label={`${l.name}: satırı kaldır`} onClick={() => setLines((c) => c.filter((x) => x.key !== l.key))}>
                    <X size={18} aria-hidden="true" />
                  </button>
                </span>
                {l.isSerial ? (
                  <SerialUnitSelect productId={l.productId} value={l.serialUnitId} onChange={(id) => update(l.key, { serialUnitId: id, quantity: "1" })} />
                ) : null}
                {/* Tezgâh hızı (K-097): miktar − / + ile, fiyat yanında; indirim nadir olduğu için çipte */}
                <span className="sale-line-foot">
                  {l.isSerial ? (
                    <span className="badge badge-gray">1 adet</span>
                  ) : (
                    <QuantityStepper label={`${l.name}: miktar`} value={l.quantity} onChange={(quantity) => update(l.key, { quantity })} />
                  )}
                  <label className="row row-gap-sm" style={{ flex: "1 1 140px" }}>
                    <span className="form-label" style={{ whiteSpace: "nowrap" }}>Fiyat ₺</span>
                    <input className="form-input" inputMode="decimal" aria-label={`${l.name}: birim fiyat`} value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} />
                  </label>
                </span>
                <OptionalGroup>
                  <OptionalField label="Satır indirimi (₺)" chip="İndirim" filled={!!l.discount} onClear={() => update(l.key, { discount: "" })}>
                    <input className="form-input" inputMode="decimal" placeholder="0,00" aria-label={`${l.name}: indirim`} value={l.discount} onChange={(e) => update(l.key, { discount: e.target.value })} />
                  </OptionalField>
                </OptionalGroup>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>Henüz ürün yok. Yukarıdan ürün arayıp ekleyin.</p>
      )}

      {/* Ürün yokken toplam, indirim ve ödeme gösterilmez; ilk ürünle açılır (K-099) */}
      {lines.length > 0 ? (
        <>
          <OptionalGroup>
            <OptionalField label="Belge indirimi (₺, tüm satışa)" chip="Belge indirimi" htmlFor="sl-docdisc" filled={!!docDiscount} onClear={() => setDocDiscount("")}>
              <input id="sl-docdisc" className="form-input" inputMode="decimal" placeholder="0,00" value={docDiscount} onChange={(e) => setDocDiscount(e.target.value)} />
            </OptionalField>
          </OptionalGroup>

          <div className="tile">
            <div className="tile-label">Satış toplamı</div>
            <div className="tile-value">{formatCurrency(totalKurus / 100)}</div>
          </div>
          {totalError ? <div className="alert alert-error" role="alert">{totalError}</div> : null}
        </>
      ) : null}

      <CustomerPicker
        value={customerId}
        onChange={setCustomerId}
        onClear={() => setCustomerId("")}
        required={false}
        label="Müşteri (veresiye için gerekli)"
      />

      {lines.length > 0 ? (
        <fieldset className="stack stack-sm" style={{ border: 0, padding: 0 }}>
          <legend className="form-label">Ödeme</legend>
          {/* Yöntem tek dokunuşla (K-097); açılır liste yok */}
          <div className="chip-group" role="group" aria-label="Ödeme yöntemi">
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <button key={m} type="button" className="chip chip-toggle" aria-pressed={method === m} onClick={() => setMethod(m)}>
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="row row-gap-sm">
            <input className="form-input" style={{ flex: 1 }} inputMode="decimal" placeholder="Alınan tutar (₺)" aria-label="Alınan tutar" value={received} onChange={(e) => setReceived(e.target.value)} />
            <button type="button" className="btn btn-secondary" onClick={() => setReceived(moneyInput(totalKurus / 100))} disabled={totalKurus === 0}>
              Tamamı
            </button>
          </div>
          {unpaidKurus > 0 && totalKurus > 0 ? (
            <div className={`alert ${customerId ? "alert-warning" : "alert-error"}`} role="status">
              {customerId
                ? `Veresiye: ${formatCurrency(unpaidKurus / 100)} müşterinin borcuna yazılacak.`
                : `Tahsil edilmeyen ${formatCurrency(unpaidKurus / 100)} var: veresiye için müşteri seçin ya da tutarı tahsil edin.`}
            </div>
          ) : null}
          {unpaidKurus > 0 && totalKurus > 0 && customerId ? (
            <OptionalGroup>
              <OptionalField label="Vade tarihi" chip="Vade tarihi" htmlFor="sl-due" filled={!!dueDate} onClear={() => setDueDate("")}>
                <DateQuickPick id="sl-due" value={dueDate} onChange={setDueDate} />
                <small style={{ color: "var(--text-muted)" }}>Girilirse vade gününde ve 7 gün gecikince hatırlatılır.</small>
              </OptionalField>
            </OptionalGroup>
          ) : null}
        </fieldset>
      ) : null}

      <OptionalGroup>
        <OptionalField label="Satış tarihi" chip="Farklı tarih" htmlFor="sl-date" filled={date !== todayLocalDate()} onClear={() => setDate(todayLocalDate())}>
          <input id="sl-date" className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <small style={{ color: "var(--text-muted)" }}>Geçmiş tarihli satış içindir. X ile kapatırsanız satış bugünün tarihiyle kaydedilir.</small>
        </OptionalField>
        <OptionalField label="Not" htmlFor="sl-notes" filled={!!notes} onClear={() => setNotes("")}>
          <input id="sl-notes" className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </OptionalField>
      </OptionalGroup>

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
