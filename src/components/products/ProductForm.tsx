"use client";

import { PhotoField } from "@/components/common/PhotoField";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const ctx = useBusinessContext();
  const settings = useSessionStore((s) => s.business?.settings);

  const [values, setValues] = useState<ProductFormInput>(() =>
    toFormInput(
      product,
      settings?.default_tax_mode ?? "INCLUSIVE",
      settings?.default_tax_rate ?? 20
    )
  );
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
      if (product) await updateProduct(ctx, product.id, parsed.fields);
      else await createProduct(ctx, parsed.fields);
      router.push("/products");
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
  const err = (key: keyof ProductFormInput) =>
    errors[key] ? (
      <p className="form-error" id={`e-${key}`} role="alert">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form className="stack stack-md" onSubmit={handleSubmit} noValidate>
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

      <div className="form-group">
        <label className="form-label" htmlFor="f-code">Ürün kodu</label>
        <input
          {...field("code")}
          className="form-input"
          value={values.code}
          onChange={(e) => set("code", e.target.value)}
        />
        {err("code")}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="f-category">Kategori</label>
        <select
          {...field("category")}
          className="form-input"
          value={values.category}
          onChange={(e) => set("category", e.target.value)}
        >
          <option value="">Seçilmedi</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="f-brand">Marka</label>
          <input {...field("brand")} className="form-input" value={values.brand} onChange={(e) => set("brand", e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="f-model">Model</label>
          <input {...field("model")} className="form-input" value={values.model} onChange={(e) => set("model", e.target.value)} />
        </div>
      </div>

      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="f-unit">Birim</label>
          <select {...field("unit")} className="form-input" value={values.unit} onChange={(e) => set("unit", e.target.value)}>
            {PRODUCT_UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
          {err("unit")}
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="f-criticalStockLevel">Kritik stok seviyesi</label>
          <input
            {...field("criticalStockLevel")}
            className="form-input"
            inputMode="decimal"
            value={values.criticalStockLevel}
            onChange={(e) => set("criticalStockLevel", e.target.value)}
          />
          {err("criticalStockLevel")}
        </div>
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
          <label className="form-label" htmlFor="f-lastPurchasePrice">Son alış fiyatı (₺)</label>
          <input
            {...field("lastPurchasePrice")}
            className="form-input"
            inputMode="decimal"
            placeholder="0,00"
            value={values.lastPurchasePrice}
            onChange={(e) => set("lastPurchasePrice", e.target.value)}
          />
          {err("lastPurchasePrice")}
        </div>
      </div>

      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="f-taxMode">KDV</label>
          <select {...field("taxMode")} className="form-input" value={values.taxMode} onChange={(e) => set("taxMode", e.target.value as TaxMode)}>
            {(Object.keys(TAX_MODE_LABELS) as TaxMode[]).map((m) => (
              <option key={m} value={m}>{TAX_MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="f-taxRate">KDV oranı (%)</label>
          <input
            {...field("taxRate")}
            className="form-input"
            inputMode="decimal"
            value={values.taxRate}
            onChange={(e) => set("taxRate", e.target.value)}
          />
          {err("taxRate")}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="f-storageLocation">Raf / konum</label>
        <input {...field("storageLocation")} className="form-input" value={values.storageLocation} onChange={(e) => set("storageLocation", e.target.value)} />
      </div>

      <PhotoField label="Ürün fotoğrafı (isteğe bağlı)" value={values.photo || undefined} onChange={(photo) => set("photo", photo ?? "")} />

      <div className="form-group">
        <label className="form-label" htmlFor="f-compatibleModelsNote">Uyumlu modeller (not)</label>
        <textarea
          {...field("compatibleModelsNote")}
          className="form-input"
          rows={3}
          value={values.compatibleModelsNote}
          onChange={(e) => set("compatibleModelsNote", e.target.value)}
        />
      </div>

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
