"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useSessionStore } from "@/stores/session";
import { MIN_QUERY_LENGTH, SEARCH_KIND_LABEL, searchAll, type SearchHit, type SearchKind } from "@/lib/search/globalSearch";

const ORDER: SearchKind[] = ["customer", "machine", "service", "sale", "purchase", "product", "supplier"];

/** Genel arama (Adım 1.10): tek kutudan müşteri, makine, servis, ürün, satış, alım ve tedarikçi. */
export function GlobalSearch() {
  const businessId = useSessionStore((s) => s.business?.id);
  const isOnline = useSessionStore((s) => s.isOnline);
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const hits = useLiveQuery(
    () => (businessId ? searchAll(businessId, query, { includeArchived }) : []),
    [businessId, query, includeArchived]
  );

  const grouped = ORDER.map((kind) => ({ kind, items: (hits ?? []).filter((h) => h.kind === kind) })).filter((g) => g.items.length > 0);
  const ready = query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <section className="stack stack-md">
      <h1>Ara</h1>
      <input
        className="form-input"
        type="search"
        placeholder="Ad, telefon, seri no, servis no, ürün kodu…"
        aria-label="Genel arama"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
        Arşivdeki kayıtlarda da ara
      </label>
      {!isOnline ? (
        <div className="alert alert-warning" role="status">
          Çevrimdışısınız: yalnızca bu cihaza eşitlenmiş kayıtlar aranır. Başka cihazda yeni açılan kayıtlar internet gelince görünür.
        </div>
      ) : null}

      {!ready ? (
        <p>Aramak için en az {MIN_QUERY_LENGTH} karakter yazın.</p>
      ) : hits === undefined ? null : grouped.length === 0 ? (
        <div className="empty-state" role="note">“{query.trim()}” için sonuç bulunamadı.</div>
      ) : (
        grouped.map((g) => (
          <section key={g.kind} className="stack stack-sm" aria-label={SEARCH_KIND_LABEL[g.kind]}>
            <h2>{SEARCH_KIND_LABEL[g.kind]}</h2>
            <ul className="menu-list">
              {g.items.map((hit: SearchHit) => (
                <li key={`${hit.kind}:${hit.id}`}>
                  <Link href={hit.href} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                    <span className="row row-between" style={{ width: "100%" }}>
                      <span>{hit.title}</span>
                      {hit.archived ? <span className="badge badge-gray">Arşivde</span> : null}
                    </span>
                    {hit.subtitle ? <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>{hit.subtitle}</small> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
