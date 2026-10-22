"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { formatPhone } from "@/lib/utils/phone";
import { foldText } from "@/lib/utils/search";
import type { Supplier } from "@/types";

/** Arama: harf içeriyorsa ad / adreste, yalnızca rakamsa telefonda (baştaki 0 yok sayılır). */
export function matchesSupplier(supplier: Supplier, query: string): boolean {
  if (!query.trim()) return true;
  if (!/\p{L}/u.test(query)) {
    const digits = query.replace(/\D/g, "").replace(/^0/, "");
    const phone = (supplier.phone ?? "").replace(/\D/g, "").replace(/^0/, "");
    return digits.length >= 3 && phone.includes(digits);
  }
  const text = foldText([supplier.name, supplier.address].filter(Boolean).join(" "));
  return foldText(query.trim()).split(/\s+/).every((word) => text.includes(word));
}

/** Tedarikçi listesi (Adım 4.5). */
export function SupplierList() {
  const businessId = useSessionStore((s) => s.business?.id);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const suppliers = useLiveQuery(
    () => (businessId ? db.suppliers.where("business_id").equals(businessId).toArray() : []),
    [businessId]
  );

  const visible = useMemo(
    () =>
      (suppliers ?? [])
        .filter((s) => showArchived || !s.archived_at)
        .filter((s) => matchesSupplier(s, query))
        .sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [suppliers, query, showArchived]
  );

  return (
    <section className="stack stack-md">
      <div className="row row-between">
        <h1>Tedarikçiler</h1>
        <Link href="/suppliers/new" className="btn btn-primary btn-sm">
          <Plus size={18} aria-hidden="true" />
          Yeni tedarikçi
        </Link>
      </div>

      <input
        className="form-input"
        type="search"
        placeholder="Ad veya telefon ara"
        aria-label="Tedarikçi ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Arşivlenmiş tedarikçileri de göster
      </label>

      {suppliers === undefined ? null : visible.length === 0 ? (
        <div className="alert alert-warning" role="note">
          {suppliers.length === 0
            ? "Henüz tedarikçi eklenmemiş. “Yeni tedarikçi” ile ilkini ekleyin."
            : "Aramanıza uyan tedarikçi yok."}
        </div>
      ) : (
        <ul className="menu-list" aria-label="Tedarikçiler">
          {visible.map((s) => (
            <li key={s.id}>
              <Link href={`/suppliers/${s.id}`} style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                <span className="row row-between" style={{ width: "100%", gap: 8 }}>
                  <span>{s.name}</span>
                  {s.archived_at ? <span className="badge badge-gray">Arşivde</span> : null}
                </span>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
                  {s.phone ? formatPhone(s.phone) : "Telefon yok"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
