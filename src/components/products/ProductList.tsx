"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { useStockBalances } from "@/hooks/useStock";
import { EMPTY_BALANCE } from "@/lib/stock/ledger";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import { unitLabel } from "@/lib/products/constants";
import { foldText } from "@/lib/utils/search";
import { isCriticalStock } from "@/lib/products/stock";
import type { Product } from "@/types";

function matches(product: Product, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [product.name, product.code, product.category, product.brand, product.model]
    .filter(Boolean)
    .map((v) => foldText(String(v)))
    .join(" ");
  return foldText(query.trim()).split(/\s+/).every((word) => haystack.includes(word));
}

/** Ürün listesi: arama, pasifleri gösterme, kritik stok rozeti (Adım 2.1, 2.9). */
export function ProductList() {
  const businessId = useSessionStore((s) => s.business?.id);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const balances = useStockBalances();

  const products = useLiveQuery(
    () => (businessId ? db.products.where("business_id").equals(businessId).toArray() : []),
    [businessId]
  );

  const visible = useMemo(() => {
    return (products ?? [])
      .filter((p) => (showArchived ? true : !p.archived_at))
      .filter((p) => matches(p, query))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [products, query, showArchived]);

  return (
    <section className="stack stack-md">
      <div className="row row-between">
        <h1>Stok</h1>
        <Link href="/products/new" className="icon-btn icon-btn-add" aria-label="Ürün ekle" title="Ürün ekle">
          <Plus size={22} aria-hidden="true" />
        </Link>
      </div>

      <input
        className="form-input"
        type="search"
        placeholder="Ürün adı, kod, marka veya kategori ara"
        aria-label="Ürün ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Pasif ürünleri de göster
      </label>

      {products === undefined ? <ListSkeleton /> : visible.length === 0 ? (
        <div className="empty-state" role="note">
          {products.length === 0
            ? "Henüz ürün eklenmemiş. Sağ üstteki + ile ilkini ekleyin."
            : "Aramanıza uyan ürün yok."}
        </div>
      ) : (
        <ul className="menu-list" aria-label="Ürünler">
          {visible.map((p) => {
            const balance = balances?.get(p.id) ?? EMPTY_BALANCE;
            return (
            <li key={p.id}>
              <Link href={`/products/${p.id}`} style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                <span className="row row-between" style={{ width: "100%", gap: 8 }}>
                  <span>{p.name}</span>
                  <span>{formatCurrency(p.default_sale_price)}</span>
                </span>
                <span className="row row-gap-sm" style={{ flexWrap: "wrap", fontWeight: 500, color: "var(--text-secondary)" }}>
                  {[p.code, p.category, [p.brand, p.model].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
                  <span className="badge badge-gray">
                    Stok: {formatQuantity(balance.available)} {unitLabel(p.unit)}
                  </span>
                  {balance.damaged > 0 ? (
                    <span className="badge badge-gray">Hasarlı: {formatQuantity(balance.damaged)}</span>
                  ) : null}
                  {isCriticalStock({ stock_available: balance.available, critical_stock_level: p.critical_stock_level }) ? (
                    <span className="badge badge-red">Kritik stok</span>
                  ) : null}
                  {p.archived_at ? <span className="badge badge-gray">Pasif</span> : null}
                </span>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
