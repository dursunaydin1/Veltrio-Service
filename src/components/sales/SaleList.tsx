"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import type { Sale } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { formatCurrency, formatDate } from "@/lib/utils";
import { foldText } from "@/lib/utils/search";

type Tab = Sale["status"];

const TABS: { id: Tab; label: string }[] = [
  { id: "FINAL", label: "Satışlar" },
  { id: "DRAFT", label: "Taslak" },
  { id: "CANCELLED", label: "İptal" },
];

export const SALE_STATUS_LABEL: Record<Sale["status"], string> = {
  DRAFT: "Taslak",
  FINAL: "Tamamlandı",
  CANCELLED: "İptal edildi",
};
export const SALE_STATUS_BADGE: Record<Sale["status"], string> = {
  DRAFT: "badge-yellow",
  FINAL: "badge-green",
  CANCELLED: "badge-red",
};

/** Arama: belge no, müşteri adı, not. */
export function matchesSale(sale: Sale, customerName: string, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = foldText([sale.document_no, customerName, sale.notes].filter(Boolean).join(" "));
  return foldText(query.trim()).split(/\s+/).every((word) => haystack.includes(word));
}

/** Satış listesi: tamamlanan / taslak / iptal sekmeleri ve arama (Adım 4.8). */
export function SaleList() {
  const businessId = useSessionStore((s) => s.business?.id);
  const [tab, setTab] = useState<Tab>("FINAL");
  const [query, setQuery] = useState("");

  const data = useLiveQuery(async () => {
    if (!businessId) return undefined;
    const [sales, customers] = await Promise.all([
      db.sales.where("business_id").equals(businessId).toArray(),
      db.customers.where("business_id").equals(businessId).toArray(),
    ]);
    return { sales, customers: new Map(customers.map((c) => [c.id, c.name])) };
  }, [businessId]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.sales
      .filter((s) => s.status === tab)
      .filter((s) => matchesSale(s, data.customers.get(s.customer_id ?? "") ?? "", query))
      .sort((a, b) => b.sale_date.localeCompare(a.sale_date) || b.created_at.localeCompare(a.created_at));
  }, [data, tab, query]);

  return (
    <section className="stack stack-md">
      <div className="row row-between">
        <h1>Satışlar</h1>
        <Link href="/sales/new" className="btn btn-primary btn-sm">
          <Plus size={18} aria-hidden="true" />
          Yeni satış
        </Link>
      </div>

      <div className="row row-gap-sm" role="tablist" aria-label="Satış durumu">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`btn btn-sm ${tab === t.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        className="form-input"
        type="search"
        placeholder="Belge no veya müşteri ara"
        aria-label="Satış ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {data === undefined ? null : visible.length === 0 ? (
        <div className="alert alert-warning" role="note">
          {data.sales.length === 0 ? "Henüz satış yok. “Yeni satış” ile ilkini yapın." : "Bu sekmede / aramada satış yok."}
        </div>
      ) : (
        <ul className="menu-list" aria-label="Satışlar">
          {visible.map((s) => (
            <li key={s.id}>
              <Link href={`/sales/${s.id}`} style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                <span className="row row-between" style={{ width: "100%", gap: 8 }}>
                  <span>{s.document_no}</span>
                  <strong>{formatCurrency(s.total_amount)}</strong>
                </span>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
                  {[data.customers.get(s.customer_id ?? "") ?? "Müşterisiz", formatDate(s.sale_date)].join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
