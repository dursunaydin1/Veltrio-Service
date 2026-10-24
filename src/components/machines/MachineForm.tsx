"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { CustomerPicker } from "@/components/customers/CustomerPicker";
import { MACHINE_TYPES, parseMachineForm, type MachineFormInput } from "@/lib/machines/schema";
import {
  DuplicateSerialError,
  createMachine,
  findMachinesBySerial,
  updateMachine,
} from "@/lib/machines/service";
import type { Machine } from "@/types";

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

/** Makine oluşturma / düzenleme formu (Adım 3.3). Düzenlemede sahip değiştirilemez. */
export function MachineForm({
  machine,
  initialCustomerId = "",
}: {
  machine?: Machine;
  initialCustomerId?: string;
}) {
  const router = useRouter();
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
      setFormError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
      return;
    }

    setBusy(true);
    try {
      const options = { allowDuplicateSerial: allowDuplicate };
      if (machine) {
        const { customer_id: _owner, ...rest } = parsed.fields;
        void _owner;
        await updateMachine(ctx, machine.id, rest, options);
        router.push(`/machines/${machine.id}`);
      } else {
        const created = await createMachine(ctx, parsed.fields, options);
        router.push(`/machines/${created.id}`);
      }
    } catch (e) {
      setFormError(
        e instanceof DuplicateSerialError ? e.message : e instanceof Error ? e.message : "Kaydedilemedi."
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
        <input {...field("type")} className="form-input" list="machine-types" value={values.type} onChange={(e) => set("type", e.target.value)} autoComplete="off" />
        <datalist id="machine-types">
          {MACHINE_TYPES.map((t) => <option key={t} value={t} />)}
        </datalist>
        {err("type")}
      </div>

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={values.isTemporary} onChange={(e) => set("isTemporary", e.target.checked)} />
        Geçici kayıt (marka / model henüz bilinmiyor)
      </label>

      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="m-brand">Marka {values.isTemporary ? "" : "*"}</label>
          <input {...field("brand")} className="form-input" value={values.brand} onChange={(e) => set("brand", e.target.value)} />
          {err("brand")}
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="m-model">Model {values.isTemporary ? "" : "*"}</label>
          <input {...field("model")} className="form-input" value={values.model} onChange={(e) => set("model", e.target.value)} />
          {err("model")}
        </div>
      </div>

      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 2 }}>
          <label className="form-label" htmlFor="m-serialNumber">Seri numarası</label>
          <input {...field("serialNumber")} className="form-input" value={values.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} autoComplete="off" />
          {err("serialNumber")}
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="m-year">Yıl</label>
          <input {...field("year")} className="form-input" inputMode="numeric" maxLength={4} value={values.year} onChange={(e) => set("year", e.target.value)} />
          {err("year")}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="m-warrantyUntil">Garanti bitiş tarihi</label>
        <input {...field("warrantyUntil")} className="form-input" type="date" value={values.warrantyUntil ?? ""} onChange={(e) => set("warrantyUntil", e.target.value)} />
        <small style={{ color: "var(--text-muted)" }}>Bilgi amaçlıdır; garanti kapsamını serviste siz doğrularsınız.</small>
        {err("warrantyUntil")}
      </div>
      {!serial ? <p>Seri numarası yoksa makine sistemin atadığı iç numarayla (MK-…) tanınır.</p> : null}

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

      <div className="form-group">
        <label className="form-label" htmlFor="m-notes">Not</label>
        <textarea {...field("notes")} className="form-input" rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
        {err("notes")}
      </div>

      {formError ? <div className="alert alert-error" role="alert">{formError}</div> : null}

      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>
        {busy ? "Kaydediliyor…" : machine ? "Değişiklikleri kaydet" : "Makineyi kaydet"}
      </button>
    </form>
  );
}
