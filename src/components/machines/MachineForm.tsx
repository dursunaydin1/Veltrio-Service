"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { CustomerPicker } from "@/components/customers/CustomerPicker";
import { MACHINE_TYPES, parseMachineForm, type MachineFormInput } from "@/lib/machines/schema";
import { brandSuggestions, modelSuggestions } from "@/lib/machines/suggest";
import { db } from "@/lib/db";
import {
  DuplicateSerialError,
  createMachine,
  findMachinesBySerial,
  updateMachine,
} from "@/lib/machines/service";
import type { Machine } from "@/types";
import { useAppNav } from "@/lib/nav/useAppNav";
import { OptionalField, OptionalGroup } from "@/components/common/OptionalField";
import { NO_CONTEXT_MESSAGE, errorMessage } from "@/lib/errors/message";

function toFormInput(machine: Machine | undefined, customerId: string): MachineFormInput {
  return {
    customerId,
    type: machine?.type ?? "",
    brand: machine?.brand ?? "",
    model: machine?.model ?? "",
    serialNumber: machine?.serial_number ?? "",
    year: machine?.year ? String(machine.year) : "",
    notes: machine?.notes ?? "",
    warrantyUntil: machine?.warranty_until ?? "",
    isTemporary: machine?.is_temporary ?? false,
  };
}

type Errors = Partial<Record<keyof MachineFormInput, string>>;

/** Marka, model ve seri no büyük harf (Türkçe kuralıyla: i → İ). */
const upper = (v: string) => v.toLocaleUpperCase("tr");

/** Makine oluşturma / düzenleme formu (Adım 3.3). Düzenlemede sahip değiştirilemez. */
export function MachineForm({
  machine,
  initialCustomerId = "",
}: {
  machine?: Machine;
  initialCustomerId?: string;
}) {
  // Kaydedince form geçmişten çıkar; geri hareketi formu yeniden açmaz (K-076)
  const nav = useAppNav();
  const ctx = useBusinessContext();

  const [values, setValues] = useState<MachineFormInput>(() =>
    toFormInput(machine, machine?.customer_id ?? initialCustomerId)
  );
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof MachineFormInput>(key: K, value: MachineFormInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  const serial = values.serialNumber.trim();
  const duplicates =
    useLiveQuery(
      () => (ctx && serial ? findMachinesBySerial(ctx.businessId, values.brand, serial, machine?.id) : []),
      [ctx?.businessId, values.brand, serial, machine?.id]
    ) ?? [];
  const blockedByDuplicate = duplicates.length > 0 && !allowDuplicate;

  // Önceki kayıtlardan marka / model önerileri (K-077): aynı model birçok müşteride olur
  const known = useLiveQuery(
    () => (ctx ? db.machines.where("business_id").equals(ctx.businessId).toArray() : []),
    [ctx?.businessId]
  );
  const brands = brandSuggestions(known ?? []);
  const models = modelSuggestions(known ?? [], values.brand);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = parseMachineForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    if (blockedByDuplicate) {
      setFormError("Aynı marka ve seri numaralı bir makine zaten var. İşaretleyerek yine de kaydedebilirsiniz.");
      return;
    }
    if (!ctx) {
      setFormError(NO_CONTEXT_MESSAGE);
      return;
    }

    setBusy(true);
    try {
      const options = { allowDuplicateSerial: allowDuplicate };
      if (machine) {
        const { customer_id: _owner, ...rest } = parsed.fields;
        void _owner;
        await updateMachine(ctx, machine.id, rest, options);
        nav.replace(`/machines/${machine.id}`);
      } else {
        const created = await createMachine(ctx, parsed.fields, options);
        nav.replace(`/machines/${created.id}`);
      }
    } catch (e) {
      setFormError(
        e instanceof DuplicateSerialError ? e.message : errorMessage(e, "Kaydedilemedi.")
      );
      setBusy(false);
    }
  }

  const field = (key: keyof MachineFormInput) => ({
    id: `m-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `me-${key}` : undefined,
  });
  const err = (key: keyof MachineFormInput) =>
    errors[key] ? (
      <p className="form-error" id={`me-${key}`} role="alert">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form className="stack stack-md" onSubmit={handleSubmit} noValidate>
      {!machine ? (
        <CustomerPicker value={values.customerId} onChange={(id) => set("customerId", id)} label="Sahibi" error={errors.customerId} />
      ) : null}

      <div className="form-group">
        <label className="form-label" htmlFor="m-type">Makine türü *</label>
        {/* Açılır liste (datalist) telefonda çalışmıyordu: hazır türler çip, listede yoksa yazılır (K-094) */}
        <div className="chip-group" aria-label="Hazır makine türleri">
          {MACHINE_TYPES.map((t) => (
            <button key={t} type="button" className="chip chip-toggle" aria-pressed={values.type === t} onClick={() => set("type", t)}>
              {t}
            </button>
          ))}
        </div>
        <input {...field("type")} className="form-input" placeholder="Listede yoksa yazın" value={values.type} onChange={(e) => set("type", e.target.value)} autoComplete="off" />
        {err("type")}
      </div>

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={values.isTemporary} onChange={(e) => set("isTemporary", e.target.checked)} />
        Geçici kayıt (marka / model henüz bilinmiyor)
      </label>

      {/* Marka / model büyük harfle tutulur (STIHL, MS 250); öneriler çip (K-094) */}
      <div className="form-group">
        <label className="form-label" htmlFor="m-brand">Marka {values.isTemporary ? "" : "*"}</label>
        <input {...field("brand")} className="form-input upper" autoComplete="off" autoCapitalize="characters" value={values.brand} onChange={(e) => set("brand", upper(e.target.value))} />
        <div className="chip-group" aria-label="Marka önerileri">
          {brands.slice(0, 6).map((b) => (
            <button key={b} type="button" className="chip chip-toggle" aria-pressed={values.brand === upper(b)} onClick={() => set("brand", upper(b))}>
              {upper(b)}
            </button>
          ))}
        </div>
        {err("brand")}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="m-model">Model {values.isTemporary ? "" : "*"}</label>
        <input {...field("model")} className="form-input upper" autoComplete="off" autoCapitalize="characters" value={values.model} onChange={(e) => set("model", upper(e.target.value))} />
        {models.length > 0 ? (
          <div className="chip-group" aria-label="Model önerileri">
            {models.slice(0, 6).map((m) => (
              <button key={m} type="button" className="chip chip-toggle" aria-pressed={values.model === upper(m)} onClick={() => set("model", upper(m))}>
                {upper(m)}
              </button>
            ))}
          </div>
        ) : null}
        {err("model")}
      </div>

      {duplicates.length > 0 ? (
        <div className="alert alert-warning" role="alert">
          <strong>Aynı marka ve seri numaralı makine kayıtlı:</strong>
          <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/machines/${d.id}`}>
                  {[d.brand, d.model].filter(Boolean).join(" ")} · {d.internal_number}
                </Link>
              </li>
            ))}
          </ul>
          <label className="row row-gap-sm" style={{ minHeight: 44 }}>
            <input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} />
            Yine de ayrı bir makine olarak kaydet
          </label>
        </div>
      ) : null}

      {!serial ? <small style={{ color: "var(--text-muted)" }}>Seri numarası girilmezse makine sistemin verdiği iç numarayla (MK-…) tanınır.</small> : null}
      <OptionalGroup title="Eklemek isterseniz">
        <OptionalField label="Seri numarası" chip="Seri no" htmlFor="m-serialNumber" filled={!!values.serialNumber} onClear={() => set("serialNumber", "")}>
          <input {...field("serialNumber")} className="form-input upper" autoCapitalize="characters" value={values.serialNumber} onChange={(e) => set("serialNumber", upper(e.target.value))} autoComplete="off" />
          {err("serialNumber")}
        </OptionalField>
        <OptionalField label="Yıl" htmlFor="m-year" filled={!!values.year} onClear={() => set("year", "")}>
          <input {...field("year")} className="form-input" inputMode="numeric" maxLength={4} value={values.year} onChange={(e) => set("year", e.target.value)} />
          {err("year")}
        </OptionalField>
        <OptionalField label="Garanti bitiş tarihi" chip="Garanti" htmlFor="m-warrantyUntil" filled={!!values.warrantyUntil} onClear={() => set("warrantyUntil", "")}>
          <input {...field("warrantyUntil")} className="form-input" type="date" value={values.warrantyUntil ?? ""} onChange={(e) => set("warrantyUntil", e.target.value)} />
          <small style={{ color: "var(--text-muted)" }}>Bilgi amaçlıdır; garanti kapsamını serviste siz doğrularsınız.</small>
          {err("warrantyUntil")}
        </OptionalField>
        <OptionalField label="Not" htmlFor="m-notes" filled={!!values.notes} onClear={() => set("notes", "")}>
          <textarea {...field("notes")} className="form-input" rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          {err("notes")}
        </OptionalField>
      </OptionalGroup>

      {formError ? <div className="alert alert-error" role="alert">{formError}</div> : null}

      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>
        {busy ? "Kaydediliyor…" : machine ? "Değişiklikleri kaydet" : "Makineyi kaydet"}
      </button>
    </form>
  );
}
