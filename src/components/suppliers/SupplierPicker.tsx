"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { matchesSupplier } from "@/components/suppliers/SupplierList";
import { useSessionStore } from "@/stores/session";
import { formatPhone } from "@/lib/utils/phone";

/** Arayarak tedarikçi seçme (satın alma vb.). Arşivlenmiş tedarikçiler seçilemez. */
export function SupplierPicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (supplierId: string) => void;
  error?: string;
}) {
  const businessId = useSessionStore((s) => s.business?.id);
  const [query, setQuery] = useState("");
  const [changing, setChanging] = useState(false);

  const suppliers = useLiveQuery(
    () =>
      businessId
        ? db.suppliers.where("business_id").equals(businessId).filter((s) => !s.archived_at).toArray()
        : [],
    [businessId]
  );

  const selected = suppliers?.find((s) => s.id === value);
  if (selected && !changing) {
    return (
      <div className="form-group">
        <span className="form-label">Tedarikçi *</span>
        <div className="row row-between card" style={{ padding: 12 }}>
          <span>
            <strong>{selected.name}</strong>
            <br />
            <small style={{ color: "var(--text-muted)" }}>{selected.phone ? formatPhone(selected.phone) : "Telefon yok"}</small>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setChanging(true)}>
            Değiştir
          </button>
        </div>
      </div>
    );
  }

  const matches = (suppliers ?? [])
    .filter((s) => matchesSupplier(s, query))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .slice(0, 6);

  return (
    <div className="form-group">
      <label className="form-label" htmlFor="supplier-picker">Tedarikçi *</label>
      <input
        id="supplier-picker"
        className="form-input"
        type="search"
        placeholder="Tedarikçi adı veya telefon ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
      />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <ul className="menu-list" aria-label="Tedarikçi sonuçları" style={{ marginTop: 8 }}>
        {matches.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => {
                onChange(s.id);
                setChanging(false);
                setQuery("");
              }}
              style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}
            >
              <span>{s.name}</span>
              <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>{s.phone ? formatPhone(s.phone) : "Telefon yok"}</small>
            </button>
          </li>
        ))}
      </ul>
      {suppliers && matches.length === 0 ? (
        <p>
          Tedarikçi bulunamadı. <Link href="/suppliers/new">Yeni tedarikçi ekleyin</Link>.
        </p>
      ) : null}
      {selected ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChanging(false)}>
          Vazgeç
        </button>
      ) : null}
    </div>
  );
}
