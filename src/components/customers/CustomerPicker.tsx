"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { matchesCustomer } from "@/components/customers/CustomerList";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { parseCustomerForm } from "@/lib/customers/schema";
import { createCustomer, DuplicatePhoneError } from "@/lib/customers/service";
import { formatPhone } from "@/lib/utils/phone";

/**
 * Arayarak müşteri seçme (makine, servis kabulü, satış vb. formlarda ortak).
 * Arşivlenmiş müşteriler seçilemez.
 */
export function CustomerPicker({
  value,
  onChange,
  label = "Müşteri",
  error,
  required = true,
  onClear,
}: {
  value: string;
  onChange: (customerId: string) => void;
  label?: string;
  error?: string;
  /** false ise etikette yıldız yok ve seçim `onClear` ile kaldırılabilir */
  required?: boolean;
  onClear?: () => void;
}) {
  const businessId = useSessionStore((s) => s.business?.id);
  const [query, setQuery] = useState("");
  const [changing, setChanging] = useState(false);
  const ctx = useBusinessContext();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", village: "", noPhone: false });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveNew() {
    if (!ctx) {
      setAddError("İşletme bilgisi yüklenemedi.");
      return;
    }
    const parsed = parseCustomerForm({ ...draft, address: "", notes: "" });
    if (!parsed.ok) {
      setAddError(Object.values(parsed.errors)[0] ?? "Bilgileri kontrol edin.");
      return;
    }
    setSaving(true);
    setAddError(null);
    try {
      const created = await createCustomer(ctx, parsed.fields);
      onChange(created.id);
      setAdding(false);
      setChanging(false);
      setQuery("");
      setDraft({ name: "", phone: "", village: "", noPhone: false });
    } catch (e) {
      setAddError(
        e instanceof DuplicatePhoneError
          ? `Bu telefon zaten kayıtlı: ${e.existing.name}. Listeden arayarak seçin.`
          : "Müşteri kaydedilemedi."
      );
    } finally {
      setSaving(false);
    }
  }

  const customers = useLiveQuery(
    () =>
      businessId
        ? db.customers.where("business_id").equals(businessId).filter((c) => !c.archived_at).toArray()
        : [],
    [businessId]
  );

  const selected = customers?.find((c) => c.id === value);

  if (selected && !changing) {
    return (
      <div className="form-group">
        <span className="form-label">{label}{required ? " *" : ""}</span>
        <div className="row row-between card" style={{ padding: 12 }}>
          <span>
            <strong>{selected.name}</strong>
            <br />
            <small style={{ color: "var(--text-muted)" }}>
              {[selected.village, selected.phone ? formatPhone(selected.phone) : null].filter(Boolean).join(" · ")}
            </small>
          </span>
          <span className="row row-gap-sm">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setChanging(true)}>
              Değiştir
            </button>
            {!required && onClear ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
                Kaldır
              </button>
            ) : null}
          </span>
        </div>
      </div>
    );
  }

  const typed = query.trim() !== "";
  const matches = (customers ?? [])
    .filter((c) => typed && matchesCustomer(c, query))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .slice(0, 6);

  return (
    <div className="form-group">
      <label className="form-label" htmlFor="customer-picker">{label}{required ? " *" : ""}</label>
      <input
        id="customer-picker"
        className="form-input"
        type="search"
        placeholder="Ad, telefon veya köy ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
      />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {typed ? (
        <ul className="menu-list" aria-label="Müşteri sonuçları" style={{ marginTop: 8 }}>
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setChanging(false);
                  setQuery("");
                }}
                style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}
              >
                <span>{c.name}</span>
                <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                  {[c.village, c.phone ? formatPhone(c.phone) : "Telefon yok"].filter(Boolean).join(" · ")}
                </small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {typed && customers && matches.length === 0 ? <p>Müşteri bulunamadı.</p> : null}
      {!adding ? (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 8 }}
          onClick={() => {
            setDraft((d) => ({ ...d, name: query.trim() }));
            setAdding(true);
          }}
        >
          + Yeni müşteri{typed ? ` “${query.trim()}”` : ""}
        </button>
      ) : (
        <div className="card stack stack-sm" style={{ marginTop: 8, padding: 12 }}>
          <strong>Yeni müşteri</strong>
          <input
            className="form-input"
            placeholder="Ad soyad *"
            aria-label="Ad soyad"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            className="form-input"
            type="tel"
            inputMode="tel"
            placeholder="Telefon *"
            aria-label="Telefon"
            disabled={draft.noPhone}
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          />
          <label className="row row-gap-sm">
            <input
              type="checkbox"
              checked={draft.noPhone}
              onChange={(e) => setDraft({ ...draft, noPhone: e.target.checked, phone: "" })}
            />
            Telefonu yok
          </label>
          <input
            className="form-input"
            placeholder="Köy / mahalle *"
            aria-label="Köy / mahalle"
            value={draft.village}
            onChange={(e) => setDraft({ ...draft, village: e.target.value })}
          />
          {addError ? <p className="form-error" role="alert">{addError}</p> : null}
          <div className="row row-gap-sm">
            <button type="button" className="btn btn-primary" onClick={saveNew} disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet ve seç"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setAdding(false); setAddError(null); }}>
              Vazgeç
            </button>
          </div>
        </div>
      )}
      {selected ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChanging(false)}>
          Vazgeç
        </button>
      ) : null}
    </div>
  );
}
