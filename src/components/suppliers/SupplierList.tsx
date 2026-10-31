"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListSkeleton, initials } from "@/components/common/ListSkeleton";
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
        <Link href="/suppliers/new" className="icon-btn icon-btn-add" aria-label="Tedarikçi ekle" title="Tedarikçi ekle">
          <Plus size={22} aria-hidden="true" />
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

      <label className="toggle-row toggle-inline">
        <span>Arşivlenmiş tedarikçileri de göster</span>
        <input type="checkbox" className="switch" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      </label>

      {suppliers === undefined ? <ListSkeleton /> : visible.length === 0 ? (
        <div className="empty-state" role="note">
          {suppliers.length === 0
            ? "Henüz tedarikçi eklenmemiş. Sağ üstteki + ile ilkini ekleyin."
            : "Aramanıza uyan tedarikçi yok."}
        </div>
      ) : (
        <ul className="menu-list" aria-label="Tedarikçiler">
          {visible.map((s) => (
            <li key={s.id}>
              <Link href={`/suppliers/${s.id}`}>
                <span className="avatar avatar-sm menu-avatar monogram" aria-hidden="true">{initials(s.name)}</span>
                <span className="list-main">
                <span className="list-title">
                  <span>{s.name}</span>
                  {s.archived_at ? <span className="badge badge-gray">Arşivde</span> : null}
                </span>
                <span className="list-sub">
                  {s.phone ? formatPhone(s.phone) : "Telefon yok"}
                </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
