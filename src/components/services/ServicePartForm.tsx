"use client";

import { useState } from "react";
import type { PartSourceType, Service } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { ProductPicker } from "@/components/products/ProductPicker";
import { parseMoneyInput, parseQuantityInput } from "@/lib/calc";
import { QuantityStepper } from "@/components/common/QuantityStepper";
import { addPart } from "@/lib/services/quote";
import { moneyInput } from "@/lib/utils";
import type { Product, TaxMode } from "@/types";
import { NO_CONTEXT_MESSAGE, errorMessage } from "@/lib/errors/message";
import { SOURCE_LABEL } from "@/components/services/serviceLineLabels";

export function PartForm({
  service,
  defaultTax,
  onDone,
}: {
  service: Service;
  defaultTax: { mode: TaxMode; rate: number };
  onDone: () => void;
}) {
  const ctx = useServiceContext();
  const [source, setSource] = useState<PartSourceType>("STOCK_PRODUCT");
  const [productId, setProductId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickProduct(p: Product) {
    setProductId(p.id);
    setPrice(moneyInput(p.default_sale_price));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const qty = parseQuantityInput(quantity);
    const priceKurus = price.trim() === "" ? undefined : parseMoneyInput(price);

    if (qty === null || qty <= 0) return setError("Miktar sıfırdan büyük olmalıdır.");
    if (price.trim() !== "" && priceKurus === null) return setError("Fiyat geçerli bir tutar olmalıdır (ör. 125,50).");
    if (source === "STOCK_PRODUCT" && !productId) return setError("Ürün seçin.");
    if (source !== "STOCK_PRODUCT" && !description.trim()) return setError("Parça açıklaması zorunludur.");
    if (!ctx) return setError(NO_CONTEXT_MESSAGE);

    setBusy(true);
    try {
      await addPart(ctx, service.id, {
        sourceType: source,
        productId: source === "STOCK_PRODUCT" ? productId : undefined,
        description: source === "STOCK_PRODUCT" ? undefined : description,
        quantity: qty,
        unitPriceKurus: priceKurus ?? undefined,
        taxMode: defaultTax.mode,
        taxRate: defaultTax.rate,
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e, "Kaydedilemedi."));
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>Parça ekle</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="pt-source">Parça kaynağı</label>
        <select id="pt-source" className="form-input" value={source} onChange={(e) => setSource(e.target.value as PartSourceType)}>
          {(Object.keys(SOURCE_LABEL) as PartSourceType[]).map((s) => (
            <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {source === "STOCK_PRODUCT" ? (
        <ProductPicker value={productId} onChange={pickProduct} label="Ürün" />
      ) : (
        <div className="form-group">
          <label className="form-label" htmlFor="pt-desc">Açıklama *</label>
          <input id="pt-desc" className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      )}

      <div className="row row-gap-md">
        <div className="form-group shrink-0" >
          <label className="form-label" htmlFor="pt-qty">Miktar</label>
          <QuantityStepper id="pt-qty" value={quantity} onChange={setQuantity} />
        </div>
        <div className="form-group grow-2" >
          <label className="form-label" htmlFor="pt-price">Birim fiyat (₺)</label>
          <input
            id="pt-price"
            className="form-input"
            inputMode="decimal"
            placeholder={source === "CUSTOMER_SUPPLIED" ? "Boş: ücretsiz" : "0,00"}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>
      {source === "STOCK_PRODUCT" ? <p>Parça eklemek stoğu değiştirmez; stok, parça “kullanıldı” denince düşer.</p> : null}

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary grow" onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary grow" disabled={busy}>{busy ? "Kaydediliyor…" : "Ekle"}</button>
      </div>
    </form>
  );
}
