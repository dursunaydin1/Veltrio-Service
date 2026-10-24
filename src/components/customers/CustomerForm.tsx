"use client";

import { PhotoField } from "@/components/common/PhotoField";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { parseCustomerForm, type CustomerFormInput } from "@/lib/customers/schema";
import {
  DuplicatePhoneError,
  createCustomer,
  findCustomersByPhone,
  updateCustomer,
} from "@/lib/customers/service";
import { formatPhone, isPlausiblePhone, normalizePhone } from "@/lib/utils/phone";
import type { Customer } from "@/types";

function toFormInput(customer?: Customer): CustomerFormInput {
  return {
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    noPhone: customer?.no_phone_flag ?? false,
    village: customer?.village ?? "",
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
    photo: customer?.photo ?? "",
  };
}

type Errors = Partial<Record<keyof CustomerFormInput, string>>;

/** Müşteri oluşturma ve düzenleme formu (Adım 3.2). */
export function CustomerForm({ customer }: { customer?: Customer }) {
  const router = useRouter();
  const ctx = useBusinessContext();

  const [values, setValues] = useState<CustomerFormInput>(() => toFormInput(customer));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof CustomerFormInput>(key: K, value: CustomerFormInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  // Yazarken aynı numaralı müşteri var mı? (AC-029)
  const typedPhone = !values.noPhone && isPlausiblePhone(values.phone) ? normalizePhone(values.phone) : "";
  const duplicates =
    useLiveQuery(
      () => (ctx && typedPhone ? findCustomersByPhone(ctx.businessId, typedPhone, customer?.id) : []),
      [ctx?.businessId, typedPhone, customer?.id]
    ) ?? [];
  const blockedByDuplicate = duplicates.length > 0 && !allowDuplicate;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = parseCustomerForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    if (blockedByDuplicate) {
      setFormError("Bu numaralı müşteri zaten var. Mevcut müşteriyi seçin veya “yine de yeni kayıt aç” kutusunu işaretleyin.");
      return;
    }
    if (!ctx) {
      setFormError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
      return;
    }

    setBusy(true);
    try {
      const options = { allowDuplicatePhone: allowDuplicate };
      if (customer) await updateCustomer(ctx, customer.id, parsed.fields, options);
      else await createCustomer(ctx, parsed.fields, options);
      router.push("/customers");
    } catch (e) {
      setFormError(
        e instanceof DuplicatePhoneError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Kaydedilemedi."
      );
      setBusy(false);
    }
  }

  const field = (key: keyof CustomerFormInput) => ({
    id: `c-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `ce-${key}` : undefined,
  });
  const err = (key: keyof CustomerFormInput) =>
    errors[key] ? (
      <p className="form-error" id={`ce-${key}`} role="alert">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form className="stack stack-md" onSubmit={handleSubmit} noValidate>
      <div className="form-group">
        <label className="form-label" htmlFor="c-name">Ad soyad *</label>
        <input
          {...field("name")}
          className="form-input"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          autoFocus={!customer}
          autoComplete="off"
        />
        {err("name")}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="c-phone">Telefon {values.noPhone ? "" : "*"}</label>
        <input
          {...field("phone")}
          className="form-input"
          type="tel"
          inputMode="tel"
          placeholder="05xx xxx xx xx"
          value={values.noPhone ? "" : values.phone}
          onChange={(e) => set("phone", e.target.value)}
          disabled={values.noPhone}
          autoComplete="off"
        />
        {err("phone")}
      </div>

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input
          type="checkbox"
          checked={values.noPhone}
          onChange={(e) => set("noPhone", e.target.checked)}
        />
        Telefonu yok
      </label>

      {duplicates.length > 0 ? (
        <div className="alert alert-warning" role="alert">
          <strong>Bu numara başka bir müşteride kayıtlı:</strong>
          <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/customers/${d.id}`}>
                  {d.name} · {d.village ?? ""} · {formatPhone(d.phone ?? "")}
                </Link>
              </li>
            ))}
          </ul>
          <label className="row row-gap-sm" style={{ minHeight: 44 }}>
            <input
              type="checkbox"
              checked={allowDuplicate}
              onChange={(e) => setAllowDuplicate(e.target.checked)}
            />
            Yine de ayrı bir müşteri olarak kaydet
          </label>
        </div>
      ) : null}

      <div className="form-group">
        <label className="form-label" htmlFor="c-village">Köy / mahalle *</label>
        <input
          {...field("village")}
          className="form-input"
          value={values.village}
          onChange={(e) => set("village", e.target.value)}
        />
        {err("village")}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="c-address">Açık adres</label>
        <textarea
          {...field("address")}
          className="form-input"
          rows={2}
          value={values.address}
          onChange={(e) => set("address", e.target.value)}
        />
        {err("address")}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="c-notes">Not</label>
        <textarea
          {...field("notes")}
          className="form-input"
          rows={3}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
        {err("notes")}
      </div>

      <PhotoField label="Müşteri fotoğrafı (isteğe bağlı)" value={values.photo || undefined} onChange={(photo) => set("photo", photo ?? "")} />

      {formError ? <div className="alert alert-error" role="alert">{formError}</div> : null}

      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>
        {busy ? "Kaydediliyor…" : customer ? "Değişiklikleri kaydet" : "Müşteriyi kaydet"}
      </button>
    </form>
  );
}
