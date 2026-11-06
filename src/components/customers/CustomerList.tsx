"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListSkeleton, initials } from "@/components/common/ListSkeleton";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { formatPhone } from "@/lib/utils/phone";
import { PageHead } from "@/components/layout/PageHead";
import { useIncremental } from "@/hooks/useIncremental";
import { LoadMore } from "@/components/common/LoadMore";
import { NoMatchAdd, prefillQuery } from "@/components/common/NoMatchAdd";
import { matchesCustomer } from "@/lib/search/match";

/** Müşteri listesi: ad, telefon veya köye göre arama (Adım 3.2). */
export function CustomerList() {
  const businessId = useSessionStore((s) => s.business?.id);
  // İlk indirme sürerken boş liste "henüz kayıt yok" demesin
  const pullingAll = useSessionStore((s) => s.pullingAll);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const customers = useLiveQuery(
    () => (businessId ? db.customers.where("business_id").equals(businessId).toArray() : []),
    [businessId]
  );

  const visible = useMemo(() => {
    return (customers ?? [])
      .filter((c) => (showArchived ? true : !c.archived_at))
      .filter((c) => matchesCustomer(c, query))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [customers, query, showArchived]);
  const shown = useIncremental(visible);

  return (
    <section className="stack stack-md">
      <PageHead title="Müşteriler" addHref="/customers/new" addLabel="Müşteri ekle" />

      {/* Aşağı kaydırınca arama kutusu üstte kalır (K-097) */}
      <div className="list-toolbar">
        <input
          className="form-input"
          type="search"
          placeholder="Ad, telefon veya köy ara"
          aria-label="Müşteri ara"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <label className="toggle-row toggle-inline">
        <span>Arşivlenmiş müşterileri de göster</span>
        <input type="checkbox" className="switch" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      </label>

      {customers === undefined || (pullingAll && visible.length === 0) ? <ListSkeleton /> : visible.length === 0 ? (
        query.trim() ? (
          <NoMatchAdd query={query} noun="müşteri" href={`/customers/new?${prefillQuery(query)}`} />
        ) : (
          <div className="empty-state" role="note">
            {customers.length === 0 ? "Henüz müşteri eklenmemiş. Üstteki “Müşteri ekle” ile ilkini ekleyin." : "Bu filtrede müşteri yok."}
          </div>
        )
      ) : (
        <>
        <ul className="menu-list" aria-label="Müşteriler">
          {shown.items.map((c) => (
            <li key={c.id}>
              <Link href={`/customers/${c.id}`}>
                {c.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo} alt="" className="avatar avatar-sm avatar-photo" />
                ) : (
                  <span className="avatar avatar-sm menu-avatar monogram" aria-hidden="true">{initials(c.name)}</span>
                )}
                <span className="list-main">
                <span className="list-title">
                  <span>{c.name}</span>
                  {c.archived_at ? <span className="badge badge-gray">Arşivde</span> : null}
                </span>
                <span className="list-sub">
                  {[c.village, c.phone ? formatPhone(c.phone) : "Telefon yok"].filter(Boolean).join(" · ")}
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
