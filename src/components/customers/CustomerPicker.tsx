"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { matchesCustomer } from "@/components/customers/CustomerList";
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

  const matches = (customers ?? [])
    .filter((c) => matchesCustomer(c, query))
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
      {customers && matches.length === 0 ? (
        <p>
          Müşteri bulunamadı. <Link href="/customers/new">Yeni müşteri ekleyin</Link>.
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
