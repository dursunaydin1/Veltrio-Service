"use client";

import { useState } from "react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { parseSupplierForm, type SupplierFormInput } from "@/lib/suppliers/schema";
import { createSupplier, updateSupplier } from "@/lib/suppliers/service";
import type { Supplier } from "@/types";
import { useAppNav } from "@/lib/nav/useAppNav";
import { OptionalField, OptionalGroup } from "@/components/common/OptionalField";

type Errors = Partial<Record<keyof SupplierFormInput, string>>;

/** Tedarikçi oluşturma / düzenleme formu (Adım 4.5). */
export function SupplierForm({ supplier, initial }: { supplier?: Supplier; initial?: { name?: string; phone?: string } }) {
  // Kaydedince form geçmişten çıkar; geri hareketi formu yeniden açmaz (K-076)
  const nav = useAppNav();
  const ctx = useBusinessContext();

  const [values, setValues] = useState<SupplierFormInput>({
    name: supplier?.name ?? initial?.name ?? "",
    phone: supplier?.phone ?? initial?.phone ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof SupplierFormInput>(key: K, value: SupplierFormInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = parseSupplierForm(values);
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
      if (supplier) {
        await updateSupplier(ctx, supplier.id, parsed.fields);
        id = supplier.id;
      } else id = (await createSupplier(ctx, parsed.fields)).id;
      nav.replace(`/suppliers/${id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setBusy(false);
    }
  }

  const err = (key: keyof SupplierFormInput) =>
    errors[key] ? (
      <p className="form-error" id={`se-${key}`} role="alert">
        {errors[key]}
      </p>
    ) : null;
  const field = (key: keyof SupplierFormInput) => ({
    id: `s-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `se-${key}` : undefined,
  });

  return (
    <form className="stack stack-md" onSubmit={handleSubmit} noValidate>
      <div className="form-group">
        <label className="form-label" htmlFor="s-name">Tedarikçi adı *</label>
        <input {...field("name")} className="form-input" value={values.name} onChange={(e) => set("name", e.target.value)} autoFocus={!supplier} autoComplete="off" />
        {err("name")}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="s-phone">Telefon</label>
        <input {...field("phone")} className="form-input" type="tel" inputMode="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="off" />
        {err("phone")}
      </div>
      <OptionalGroup>
        <OptionalField label="Adres" chip="Adres" htmlFor="s-address" filled={!!values.address} onClear={() => set("address", "")}>
          <textarea {...field("address")} className="form-input" rows={2} value={values.address} onChange={(e) => set("address", e.target.value)} />
          {err("address")}
        </OptionalField>
        <OptionalField label="Not" htmlFor="s-notes" filled={!!values.notes} onClear={() => set("notes", "")}>
          <textarea {...field("notes")} className="form-input" rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          {err("notes")}
        </OptionalField>
      </OptionalGroup>

      {formError ? <div className="alert alert-error" role="alert">{formError}</div> : null}

      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>
        {busy ? "Kaydediliyor…" : supplier ? "Değişiklikleri kaydet" : "Tedarikçiyi kaydet"}
      </button>
    </form>
  );
}
