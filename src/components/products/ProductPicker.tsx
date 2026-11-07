"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useStockBalances } from "@/hooks/useStock";
import { useSessionStore } from "@/stores/session";
import { unitLabel } from "@/lib/products/constants";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import { matchesProduct } from "@/lib/search/match";
import { ProductThumb } from "@/components/products/ProductThumb";
import type { Product } from "@/types";

/**
 * Arayarak ürün seçme (servis parçası, satış vb.). Pasif ve seri takipli
 * (makine) ürünler listelenmez; stok miktarı yanında gösterilir.
 */
export function ProductPicker({
  value,
  onChange,
  label = "Ürün",
  includeSerial = false,
}: {
  value: string;
  onChange: (product: Product) => void;
  label?: string;
  /** true: seri takipli (makine) ürünler de listelenir (satış, alım) */
  includeSerial?: boolean;
}) {
  const businessId = useSessionStore((s) => s.business?.id);
  const balances = useStockBalances();
  const [query, setQuery] = useState("");
  const [changing, setChanging] = useState(false);

  const products = useLiveQuery(
    () =>
      businessId
        ? db.products
            .where("business_id")
            .equals(businessId)
            .filter((p) => !p.archived_at && (includeSerial || !p.is_serial_tracked))
            .toArray()
        : [],
    [businessId, includeSerial]
  );

  const selected = products?.find((p) => p.id === value);
  if (selected && !changing) {
    return (
      <div className="form-group">
        <span className="form-label">{label} *</span>
        <div className="row row-between card" style={{ padding: 12, gap: 12 }}>
          <ProductThumb product={selected} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{selected.name}</strong>
            <br />
            <small className="muted">
              Stok: {formatQuantity(balances?.get(selected.id)?.available ?? 0)} {unitLabel(selected.unit)} ·{" "}
              {formatCurrency(selected.default_sale_price)}
            </small>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setChanging(true)}>
            Değiştir
          </button>
        </div>
      </div>
    );
  }

  const typed = query.trim() !== "";
  const matches = (products ?? [])
    .filter((p) => matchesProduct(p, query))
    // Arama yokken en son eklenen / güncellenen önde (yeni kayıt hemen görünür); aranırken alfabetik.
    // Liste kutu içinde kayar (K-088); çok büyük listede ilk 200 çizilir.
    .sort((a, b) => (typed ? a.name.localeCompare(b.name, "tr") : (b.updated_at ?? b.created_at ?? "").localeCompare(a.updated_at ?? a.created_at ?? "")))
    .slice(0, 200);

  return (
    <div className="form-group">
      <label className="form-label" htmlFor="product-picker">{label} *</label>
      <input
        id="product-picker"
        className="form-input"
        type="search"
        placeholder="Ürün adı, kod veya marka ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <ul className="menu-list picker-list mt-2" aria-label="Ürün sonuçları" >
        {matches.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                onChange(p);
                setChanging(false);
                setQuery("");
              }}
              style={{ alignItems: "center", gap: 12 }}
            >
              <ProductThumb product={p} size={40} />
              <span className="stack" style={{ gap: 2, minWidth: 0, alignItems: "flex-start" }}>
                <span>{p.name}</span>
                <small className="meta">
                  Stok: {formatQuantity(balances?.get(p.id)?.available ?? 0)} {unitLabel(p.unit)} ·{" "}
                  {formatCurrency(p.default_sale_price)}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {products && matches.length === 0 ? <p>Ürün bulunamadı.</p> : null}
    </div>
  );
}
