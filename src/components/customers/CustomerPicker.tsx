"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { matchesCustomer } from "@/lib/search/match";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { parseCustomerForm } from "@/lib/customers/schema";
import { createCustomer, DuplicatePhoneError } from "@/lib/customers/service";
import { formatPhone } from "@/lib/utils/phone";

/**
 * Arayarak müşteri seçme (makine, servis kabulü, satış vb. formlarda ortak).
 * Arşivlenmiş müşteriler seçilemez (`includeArchived` ile raporlarda seçilebilir).
 */
export function CustomerPicker({
  value,
  onChange,
  label = "Müşteri",
  error,
  required = true,
  onClear,
  allowAdd = true,
  includeArchived = false,
}: {
  value: string;
  onChange: (customerId: string) => void;
  label?: string;
  error?: string;
  /** false ise etikette yıldız yok ve seçim `onClear` ile kaldırılabilir */
  required?: boolean;
  onClear?: () => void;
  /** false: "+ Yeni müşteri" düğmesi yok (rapor ekranları) */
  allowAdd?: boolean;
  /** true: arşivlenmiş müşteriler de listelenir (geçmiş hesap ekstresi) */
  includeArchived?: boolean;
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
        ? db.customers.where("business_id").equals(businessId).filter((c) => includeArchived || !c.archived_at).toArray()
        : [],
    [businessId, includeArchived]
  );

  const selected = customers?.find((c) => c.id === value);

  if (selected && !changing) {
    return (
      <div className="form-group">
        <span className="form-label">{label}{required ? " *" : ""}</span>
        <div className="row row-between card pad-3" >
          <span>
            <strong>{selected.name}</strong>
            <br />
            <small className="muted">
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
    .filter((c) => !typed || matchesCustomer(c, query))
    // Arama yokken en son eklenen / güncellenen önde (yeni kayıt hemen görünür); aranırken alfabetik.
    // Liste kutu içinde kayar (K-088); çok büyük listede ilk 200 çizilir.
    .sort((a, b) => (typed ? a.name.localeCompare(b.name, "tr") : (b.updated_at ?? b.created_at ?? "").localeCompare(a.updated_at ?? a.created_at ?? "")))
    .slice(0, 200);

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
      {matches.length > 0 ? (
        <ul className="menu-list picker-list mt-2" aria-label="Müşteri sonuçları" >
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setChanging(false);
                  setQuery("");
                }}
                className="item-stack"
              >
                <span>{c.name}</span>
                <small className="meta">
                  {[c.village, c.phone ? formatPhone(c.phone) : "Telefon yok"].filter(Boolean).join(" · ")}
                </small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {typed && customers && matches.length === 0 ? <p>Müşteri bulunamadı.</p> : null}
      {!allowAdd ? null : !adding ? (
        <button
          type="button"
          className="btn btn-secondary mt-2"
          
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
