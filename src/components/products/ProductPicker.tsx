"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useStockBalances } from "@/hooks/useStock";
import { useSessionStore } from "@/stores/session";
import { unitLabel } from "@/lib/products/constants";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import { foldText } from "@/lib/utils/search";
import type { Product } from "@/types";

/**
 * Arayarak ürün seçme (servis parçası, satış vb.). Pasif ve seri takipli
 * (makine) ürünler listelenmez; stok miktarı yanında gösterilir.
 */
export function ProductPicker({
  value,
  onChange,
  label = "Ürün",
}: {
  value: string;
  onChange: (product: Product) => void;
  label?: string;
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
            .filter((p) => !p.archived_at && !p.is_serial_tracked)
            .toArray()
        : [],
    [businessId]
  );

  const selected = products?.find((p) => p.id === value);
  if (selected && !changing) {
    return (
      <div className="form-group">
        <span className="form-label">{label} *</span>
        <div className="row row-between card" style={{ padding: 12 }}>
          <span>
            <strong>{selected.name}</strong>
            <br />
            <small style={{ color: "var(--text-muted)" }}>
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

  const words = foldText(query.trim()).split(/\s+/).filter(Boolean);
  const matches = (products ?? [])
    .filter((p) => {
      const haystack = foldText([p.name, p.code, p.brand, p.model, p.category].filter(Boolean).join(" "));
      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .slice(0, 6);

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
      <ul className="menu-list" aria-label="Ürün sonuçları" style={{ marginTop: 8 }}>
        {matches.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                onChange(p);
                setChanging(false);
                setQuery("");
              }}
              style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}
            >
              <span>{p.name}</span>
              <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                Stok: {formatQuantity(balances?.get(p.id)?.available ?? 0)} {unitLabel(p.unit)} ·{" "}
                {formatCurrency(p.default_sale_price)}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {products && matches.length === 0 ? <p>Ürün bulunamadı.</p> : null}
    </div>
  );
}
