"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { initials } from "@/lib/utils/text";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { formatPhone } from "@/lib/utils/phone";
import { PageHead } from "@/components/layout/PageHead";
import { useIncremental } from "@/hooks/useIncremental";
import { LoadMore } from "@/components/common/LoadMore";
import { NoMatchAdd, prefillQuery } from "@/components/common/NoMatchAdd";
import { matchesSupplier } from "@/lib/search/match";

/** Tedarikçi listesi (Adım 4.5). */
export function SupplierList() {
  const businessId = useSessionStore((s) => s.business?.id);
  // İlk indirme sürerken boş liste "henüz kayıt yok" demesin
  const pullingAll = useSessionStore((s) => s.pullingAll);
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
  const shown = useIncremental(visible);

  return (
    <section className="stack stack-md">
      <PageHead title="Tedarikçiler" addHref="/suppliers/new" addLabel="Tedarikçi ekle" />

      {/* Aşağı kaydırınca arama kutusu üstte kalır (K-097) */}
      <div className="list-toolbar">
        <input
          className="form-input"
          type="search"
          placeholder="Ad veya telefon ara"
          aria-label="Tedarikçi ara"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <label className="toggle-row toggle-inline">
        <span>Arşivlenmiş tedarikçileri de göster</span>
        <input type="checkbox" className="switch" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      </label>

      {suppliers === undefined || (pullingAll && visible.length === 0) ? <ListSkeleton /> : visible.length === 0 ? (
        query.trim() ? (
          <NoMatchAdd query={query} noun="tedarikçi" href={`/suppliers/new?${prefillQuery(query)}`} />
        ) : (
          <div className="empty-state" role="note">
            {suppliers.length === 0 ? "Henüz tedarikçi eklenmemiş. Üstteki “Tedarikçi ekle” ile ilkini ekleyin." : "Bu filtrede tedarikçi yok."}
          </div>
        )
      ) : (
        <>
        <ul className="menu-list" aria-label="Tedarikçiler">
          {shown.items.map((s) => (
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
        {shown.hasMore ? <LoadMore remaining={shown.remaining} onMore={shown.next} /> : null}
      </>
      )}
    </section>
  );
}
