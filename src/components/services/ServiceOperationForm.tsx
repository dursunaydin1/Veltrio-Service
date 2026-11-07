"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Service, ServiceOperation } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { parseMoneyInput, parseQuantityInput } from "@/lib/calc";
import { QuantityStepper } from "@/components/common/QuantityStepper";
import { addOperation, updateOperation } from "@/lib/services/quote";
import { moneyInput } from "@/lib/utils";
import type { TaxMode } from "@/types";
import { OptionalField, OptionalGroup } from "@/components/common/OptionalField";
import { NO_CONTEXT_MESSAGE, errorMessage } from "@/lib/errors/message";

export function OperationForm({
  service,
  edit,
  defaultTax,
  onDone,
}: {
  service: Service;
  edit?: ServiceOperation;
  defaultTax: { mode: TaxMode; rate: number };
  onDone: () => void;
}) {
  const ctx = useServiceContext();
  const [description, setDescription] = useState(edit?.description ?? "");
  const [quantity, setQuantity] = useState(edit ? String(edit.quantity).replace(".", ",") : "1");
  const [price, setPrice] = useState(edit && !edit.price_pending ? moneyInput(edit.unit_price) : "");
  const [discount, setDiscount] = useState(edit && edit.discount_amount > 0 ? moneyInput(edit.discount_amount) : "");
  const [taxMode, setTaxMode] = useState<TaxMode>((edit?.tax_mode as TaxMode) ?? defaultTax.mode);
  const [taxRate, setTaxRate] = useState(String(edit?.tax_rate ?? defaultTax.rate).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Hızlı seçim (K-083): katalogdaki işlemler, geçmiş servislerde en çok kullanılan önce (Ayarlar → Kataloglar → İşlemler)
  const catalog = useLiveQuery(async () => {
    const [entries, used] = await Promise.all([
      db.operation_catalog.where("business_id").equals(service.business_id).filter((o) => o.active).toArray(),
      db.service_operations.where("business_id").equals(service.business_id).toArray(),
    ]);
    const count = new Map<string, number>();
    for (const op of used) count.set(op.description.trim().toLocaleLowerCase("tr"), (count.get(op.description.trim().toLocaleLowerCase("tr")) ?? 0) + 1);
    const uses = (name: string) => count.get(name.trim().toLocaleLowerCase("tr")) ?? 0;
    return entries.sort((a, b) => uses(b.name) - uses(a.name) || a.name.localeCompare(b.name, "tr"));
  }, [service.business_id]);
  const [showAllCatalog, setShowAllCatalog] = useState(false);
  const QUICK = 6;

  /** Katalogtan seçim açıklamayı ve önerilen fiyatı forma kopyalar; sonradan değişse satır değişmez. */
  function pickFromCatalog(id: string) {
    const entry = catalog?.find((o) => o.id === id);
    if (!entry) return;
    setDescription(entry.name);
    if (entry.suggested_price !== undefined) setPrice(moneyInput(entry.suggested_price));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const qty = parseQuantityInput(quantity);
    const rate = parseQuantityInput(taxRate);
    const priceKurus = price.trim() === "" ? null : parseMoneyInput(price);
    const discountKurus = discount.trim() === "" ? 0 : parseMoneyInput(discount);

    if (!description.trim()) return setError("İşlem açıklaması zorunludur.");
    if (qty === null || qty <= 0) return setError("Miktar sıfırdan büyük olmalıdır.");
    if (price.trim() !== "" && priceKurus === null) return setError("Fiyat geçerli bir tutar olmalıdır (ör. 450,00).");
    if (discountKurus === null) return setError("İndirim geçerli bir tutar olmalıdır.");
    if (rate === null || rate > 100) return setError("KDV oranı 0 ile 100 arasında olmalıdır.");
    if (!ctx) return setError(NO_CONTEXT_MESSAGE);

    const input = { description, quantity: qty, unitPriceKurus: priceKurus, discountKurus, taxMode, taxRate: rate };
    setBusy(true);
    try {
      if (edit) await updateOperation(ctx, edit.id, input);
      else await addOperation(ctx, service.id, input);
      onDone();
    } catch (e) {
      setError(errorMessage(e, "Kaydedilemedi."));
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>{edit ? "İşlemi düzenle" : "İşlem ekle"}</h3>
      <div className="form-group">
        {!edit && catalog && catalog.length > 0 ? (
          <div className="stack stack-sm" style={{ marginBottom: 8 }}>
            <span className="form-label">Sık yapılan işlemler</span>
            <div className="chip-group" aria-label="Sık yapılan işlemler">
              {(showAllCatalog ? catalog : catalog.slice(0, QUICK)).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="chip chip-toggle"
                  aria-pressed={description === o.name}
                  onClick={() => pickFromCatalog(o.id)}
                >
                  {o.name}
                  {o.suggested_price !== undefined ? <small className="meta">{moneyInput(o.suggested_price)} ₺</small> : null}
                </button>
              ))}
              {!showAllCatalog && catalog.length > QUICK ? (
                <button type="button" className="chip chip-add" onClick={() => setShowAllCatalog(true)}>
                  Tümü ({catalog.length})
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <label className="form-label" htmlFor="op-desc">Açıklama *</label>
        <input id="op-desc" className="form-input" placeholder="Ör. karbüratör ayarı" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
      </div>
      <div className="row row-gap-md">
        <div className="form-group shrink-0">
          <label className="form-label" htmlFor="op-qty">Miktar</label>
          <QuantityStepper id="op-qty" value={quantity} onChange={setQuantity} />
        </div>
        <div className="form-group grow-2">
          <label className="form-label" htmlFor="op-price">Birim fiyat (₺)</label>
          <input id="op-price" className="form-input" inputMode="decimal" placeholder="Boş: fiyat sonra" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      {price.trim() === "" ? <p>Fiyat girilmezse kalem “fiyat bekleniyor” olur ve iş tamamlanamaz.</p> : null}
      <OptionalGroup>
        <OptionalField label="İndirim (₺, toplam)" chip="İndirim" htmlFor="op-discount" filled={discount.trim() !== ""} onClear={() => setDiscount("")}>
          <input id="op-discount" className="form-input" inputMode="decimal" placeholder="0,00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </OptionalField>
        <OptionalField
          label="KDV"
          chip={`KDV: ${taxMode === "NONE" ? "yok" : `${taxMode === "INCLUSIVE" ? "dahil" : "hariç"} %${taxRate}`} · değiştir`}
          htmlFor="op-tax"
          filled={taxMode !== defaultTax.mode || taxRate !== String(defaultTax.rate).replace(".", ",")}
          onClear={() => {
            setTaxMode(defaultTax.mode);
            setTaxRate(String(defaultTax.rate).replace(".", ","));
          }}
        >
          <div className="row row-gap-md">
            <select id="op-tax" className="form-input grow" value={taxMode} onChange={(e) => setTaxMode(e.target.value as TaxMode)}>
              <option value="INCLUSIVE">KDV dahil</option>
              <option value="EXCLUSIVE">KDV hariç</option>
              <option value="NONE">KDV yok</option>
            </select>
            <input id="op-rate" className="form-input grow" inputMode="decimal" aria-label="KDV oranı (%)" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </div>
        </OptionalField>
      </OptionalGroup>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary grow" onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary grow" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </form>
  );
}
