"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/lib/db";
import type { Purchase } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageHead } from "@/components/layout/PageHead";
import { useIncremental } from "@/hooks/useIncremental";
import { LoadMore } from "@/components/common/LoadMore";
import { matchesPurchase } from "@/lib/search/match";

type Tab = Purchase["status"];

const TABS: { id: Tab; label: string }[] = [
  { id: "RECEIVED", label: "Teslim alınan" },
  { id: "DRAFT", label: "Taslak" },
  { id: "CANCELLED", label: "İptal" },
];


/** Satın alma listesi: teslim alınan / taslak / iptal sekmeleri ve arama (Adım 4.6). */
export function PurchaseList() {
  const businessId = useSessionStore((s) => s.business?.id);
  // İlk indirme sürerken boş liste "henüz kayıt yok" demesin
  const pullingAll = useSessionStore((s) => s.pullingAll);
  const [tab, setTab] = useState<Tab>("RECEIVED");
  const [query, setQuery] = useState("");

  const data = useLiveQuery(async () => {
    if (!businessId) return undefined;
    const [purchases, suppliers] = await Promise.all([
      db.purchases.where("business_id").equals(businessId).toArray(),
      db.suppliers.where("business_id").equals(businessId).toArray(),
    ]);
    return { purchases, suppliers: new Map(suppliers.map((s) => [s.id, s.name])) };
  }, [businessId]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.purchases
      .filter((p) => p.status === tab)
      .filter((p) => matchesPurchase(p, data.suppliers.get(p.supplier_id ?? "") ?? "", query))
      .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
  }, [data, tab, query]);
  const shown = useIncremental(visible);

  return (
    <section className="stack stack-md">
      <PageHead title="Satın Almalar" addHref="/purchases/new" addLabel="Satın al" />

      {/* Aşağı kaydırınca sekmeler ve arama üstte kalır (K-097) */}
      <div className="list-toolbar">
        <div role="tablist" aria-label="Alım durumu">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="form-input"
          type="search"
          placeholder="Belge no, tedarikçi veya fatura no ara"
          aria-label="Alım ara"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {data === undefined || (pullingAll && visible.length === 0) ? <ListSkeleton /> : visible.length === 0 ? (
        <div className="empty-state" role="note">
          {data.purchases.length === 0
            ? "Henüz alım kaydı yok. Üstteki “Satın al” ile ilkini ekleyin."
            : "Bu sekmede / aramada alım yok."}
        </div>
      ) : (
        <>
        <ul className="menu-list" aria-label="Alımlar">
          {shown.items.map((p) => (
            <li key={p.id}>
              <Link href={`/purchases/${p.id}`} style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                <span className="row row-between" style={{ width: "100%", gap: 8 }}>
                  <span>{p.document_no}</span>
                  <strong>{formatCurrency(p.total_amount)}</strong>
                </span>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
                  {[data.suppliers.get(p.supplier_id ?? ""), formatDate(p.purchase_date), p.supplier_ref].filter(Boolean).join(" · ")}
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
