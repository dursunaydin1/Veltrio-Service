"use client";

import { PhotoField } from "@/components/common/PhotoField";
import { useState } from "react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { useSessionStore } from "@/stores/session";
import { PRODUCT_CATEGORIES, PRODUCT_UNITS, TAX_MODE_LABELS } from "@/lib/products/constants";
import { parseProductForm, type ProductFormInput } from "@/lib/products/schema";
import {
  ProductCodeTakenError,
  createProduct,
  updateProduct,
} from "@/lib/products/service";
import type { Product, TaxMode } from "@/types";
import { useAppNav } from "@/lib/nav/useAppNav";
import { OptionalField, OptionalGroup } from "@/components/common/OptionalField";

const money = (n: number | null | undefined) =>
  n == null ? "" : n.toFixed(2).replace(".", ",");
const decimal = (n: number | null | undefined) =>
  n == null ? "" : String(n).replace(".", ",");

function toFormInput(product: Product | undefined, taxMode: TaxMode, taxRate: number): ProductFormInput {
  return {
    name: product?.name ?? "",
    code: product?.code ?? "",
    category: product?.category ?? "",
    brand: product?.brand ?? "",
    model: product?.model ?? "",
    unit: product?.unit ?? "ADET",
    isSerialTracked: product?.is_serial_tracked ?? false,
    salePrice: product ? money(product.default_sale_price) : "",
    lastPurchasePrice: money(product?.last_purchase_price),
    taxMode: product?.default_tax_mode ?? taxMode,
    taxRate: decimal(product?.default_tax_rate ?? taxRate),
    criticalStockLevel: decimal(product?.critical_stock_level),
    compatibleModelsNote: product?.compatible_models_note ?? "",
    storageLocation: product?.storage_location ?? "",
    photo: product?.photo ?? "",
  };
}

type Errors = Partial<Record<keyof ProductFormInput, string>>;

/** Ürün oluşturma ve düzenleme formu (Adım 2.1). */
export function ProductForm({ product, initial }: { product?: Product; initial?: { name?: string; barcode?: string } }) {
  // QR / Barkod Tara'da tanınmayan barkoddan açıldıysa yeni ürüne kaydedilir (K-102)
  const barcode = !product ? initial?.barcode?.trim() || undefined : undefined;
  // Kaydedince form geçmişten çıkar; geri hareketi formu yeniden açmaz (K-076)
  const nav = useAppNav();
  const ctx = useBusinessContext();
  const settings = useSessionStore((s) => s.business?.settings);

  const [values, setValues] = useState<ProductFormInput>(() => ({
    ...toFormInput(
      product,
      settings?.default_tax_mode ?? "INCLUSIVE",
      settings?.default_tax_rate ?? 20
    ),
    ...(!product && initial?.name ? { name: initial.name } : {}),
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof ProductFormInput>(key: K, value: ProductFormInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = parseProductForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    if (!ctx) {
      setFormError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
      return;
    }

    setBusy(true);
    try {
      let id: string;
      if (product) {
        await updateProduct(ctx, product.id, parsed.fields);
        id = product.id;
      } else id = (await createProduct(ctx, { ...parsed.fields, barcode })).id;
      nav.replace(`/products/${id}`);
    } catch (e) {
      if (e instanceof ProductCodeTakenError) setErrors({ code: e.message });
      else setFormError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setBusy(false);
    }
  }

  const field = (key: keyof ProductFormInput) => ({
    id: `f-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `e-${key}` : undefined,
  });
  // Açılıştaki KDV: "değiştir" çipi yalnızca bundan farklıysa açık gelir
  const [initialTax] = useState(() => ({ mode: values.taxMode, rate: values.taxRate }));
  const err = (key: keyof ProductFormInput) =>
    errors[key] ? (
      <p className="form-error" id={`e-${key}`} role="alert">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form className="stack stack-md" onSubmit={handleSubmit} noValidate>
      {barcode ? (
        <div className="alert alert-info" role="note">
          Okutulan barkod <b className="mono">{barcode}</b> bu ürüne kaydedilecek.
        </div>
      ) : null}
      <div className="form-group">
        <label className="form-label" htmlFor="f-name">Ürün adı *</label>
        <input
          {...field("name")}
          className="form-input"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          autoFocus={!product}
        />
        {err("name")}
      </div>

      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="f-salePrice">Satış fiyatı (₺) *</label>
          <input
            {...field("salePrice")}
            className="form-input"
            inputMode="decimal"
            placeholder="0,00"
            value={values.salePrice}
            onChange={(e) => set("salePrice", e.target.value)}
          />
          {err("salePrice")}
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="f-unit">Birim</label>
          <select {...field("unit")} className="form-input" value={values.unit} onChange={(e) => set("unit", e.target.value)}>
            {PRODUCT_UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
          {err("unit")}
        </div>
      </div>

      {/* Seyrek doldurulan bilgiler "+ …" çipleriyle açılır (K-086) */}
      <OptionalGroup title="Eklemek isterseniz">
        <OptionalField label="Ürün kodu" htmlFor="f-code" filled={!!values.code} onClear={() => set("code", "")}>
          <input {...field("code")} className="form-input" value={values.code} onChange={(e) => set("code", e.target.value)} />
          {err("code")}
        </OptionalField>
        <OptionalField label="Kategori" htmlFor="f-category" filled={!!values.category} onClear={() => set("category", "")}>
          <select {...field("category")} className="form-input" value={values.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Seçilmedi</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </OptionalField>
        <OptionalField
          label="Marka / model"
          htmlFor="f-brand"
          filled={!!(values.brand || values.model)}
          onClear={() => {
            set("brand", "");
            set("model", "");
          }}
        >
          <div className="row row-gap-md">
            <input {...field("brand")} className="form-input" style={{ flex: 1 }} placeholder="Marka" value={values.brand} onChange={(e) => set("brand", e.target.value.toLocaleUpperCase("tr"))} autoCapitalize="characters" />
            <input {...field("model")} className="form-input" style={{ flex: 1 }} placeholder="Model" aria-label="Model" value={values.model} onChange={(e) => set("model", e.target.value.toLocaleUpperCase("tr"))} autoCapitalize="characters" />
          </div>
        </OptionalField>
        <OptionalField label="Son alış fiyatı (₺)" chip="Alış fiyatı" htmlFor="f-lastPurchasePrice" filled={!!values.lastPurchasePrice} onClear={() => set("lastPurchasePrice", "")}>
          <input {...field("lastPurchasePrice")} className="form-input" inputMode="decimal" placeholder="0,00" value={values.lastPurchasePrice} onChange={(e) => set("lastPurchasePrice", e.target.value)} />
          {err("lastPurchasePrice")}
        </OptionalField>
        <OptionalField label="Kritik stok seviyesi" chip="Kritik stok" htmlFor="f-criticalStockLevel" filled={!!values.criticalStockLevel} onClear={() => set("criticalStockLevel", "")}>
          <input {...field("criticalStockLevel")} className="form-input" inputMode="decimal" value={values.criticalStockLevel} onChange={(e) => set("criticalStockLevel", e.target.value)} />
          <small style={{ color: "var(--text-muted)" }}>Stok bu miktara inince uyarılırsınız.</small>
          {err("criticalStockLevel")}
        </OptionalField>
        <OptionalField
          label="KDV"
          chip={`KDV: ${TAX_MODE_LABELS[values.taxMode as TaxMode] ?? values.taxMode}${values.taxMode === "NONE" ? "" : ` %${values.taxRate}`} · değiştir`}
          htmlFor="f-taxMode"
          filled={values.taxMode !== initialTax.mode || values.taxRate !== initialTax.rate}
          onClear={() => {
            set("taxMode", initialTax.mode);
            set("taxRate", initialTax.rate);
          }}
        >
          <div className="row row-gap-md">
            <select {...field("taxMode")} className="form-input" style={{ flex: 1 }} value={values.taxMode} onChange={(e) => set("taxMode", e.target.value as TaxMode)}>
              {(Object.keys(TAX_MODE_LABELS) as TaxMode[]).map((m) => (
                <option key={m} value={m}>{TAX_MODE_LABELS[m]}</option>
              ))}
            </select>
            <input {...field("taxRate")} className="form-input" style={{ flex: 1 }} inputMode="decimal" aria-label="KDV oranı (%)" value={values.taxRate} onChange={(e) => set("taxRate", e.target.value)} />
          </div>
          {err("taxRate")}
        </OptionalField>
        <OptionalField label="Raf / konum" chip="Raf yeri" htmlFor="f-storageLocation" filled={!!values.storageLocation} onClear={() => set("storageLocation", "")}>
          <input {...field("storageLocation")} className="form-input" value={values.storageLocation} onChange={(e) => set("storageLocation", e.target.value)} />
        </OptionalField>
        <OptionalField label="Uyumlu modeller" htmlFor="f-compatibleModelsNote" filled={!!values.compatibleModelsNote} onClear={() => set("compatibleModelsNote", "")}>
          <textarea {...field("compatibleModelsNote")} className="form-input" rows={3} value={values.compatibleModelsNote} onChange={(e) => set("compatibleModelsNote", e.target.value)} />
        </OptionalField>
        <OptionalField label="Ürün fotoğrafı" chip="Fotoğraf" filled={!!values.photo} onClear={() => set("photo", "")}>
          <PhotoField label="Ürün fotoğrafı" value={values.photo || undefined} onChange={(photo) => set("photo", photo ?? "")} />
        </OptionalField>
      </OptionalGroup>

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input
          type="checkbox"
          checked={values.isSerialTracked}
          onChange={(e) => set("isSerialTracked", e.target.checked)}
          disabled={!!product}
        />
        Seri numarası ile takip edilir (makineler)
      </label>
      {product ? (
        <p>Seri takibi, stok hareketi oluştuktan sonra değiştirilemez.</p>
      ) : null}

      {formError ? (
        <div className="alert alert-error" role="alert">{formError}</div>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>
        {busy ? "Kaydediliyor…" : product ? "Değişiklikleri kaydet" : "Ürünü kaydet"}
      </button>
    </form>
  );
}
