"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { SALE_STATUS_LABEL } from "@/components/sales/SaleList";
import { PURCHASE_STATUS_LABEL } from "@/components/purchases/PurchaseList";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/utils";

const LIMIT = 30;

/** Üründeki alış hareketleri: hangi alımla, ne kadar ve hangi fiyatla geldi (Adım 2.9). */
export function ProductPurchases({ productId }: { productId: string }) {
  const rows = useLiveQuery(async () => {
    const items = await db.purchase_items.where("product_id").equals(productId).toArray();
    const out = [];
    for (const item of items) {
      const purchase = await db.purchases.get(item.purchase_id);
      if (purchase) out.push({ item, purchase });
    }
    return out.sort((a, b) => b.purchase.purchase_date.localeCompare(a.purchase.purchase_date));
  }, [productId]);

  return (
    <section className="card stack stack-md" aria-labelledby="pp-title">
      <h2 id="pp-title">Alışlar</h2>
      {rows === undefined ? null : rows.length === 0 ? (
        <p>Bu ürün için alım kaydı yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Alışlar">
          {rows.slice(0, LIMIT).map(({ item, purchase }) => (
            <li key={item.id}>
              <Link href={`/purchases/${purchase.id}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span className="row row-between" style={{ width: "100%" }}>
                  <span>{purchase.document_no}</span>
                  <strong>{formatCurrency(item.line_total)}</strong>
                </span>
                <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                  {formatDate(purchase.purchase_date)} · {formatQuantity(item.quantity)} {item.unit} × {formatCurrency(item.unit_price)} ·{" "}
                  {PURCHASE_STATUS_LABEL[purchase.status]}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Üründeki satışlar (taslaklar hariç): hangi belgeyle, ne kadar ve hangi fiyatla satıldı. */
export function ProductSales({ productId }: { productId: string }) {
  const rows = useLiveQuery(async () => {
    const items = await db.sale_items.where("product_id").equals(productId).toArray();
    const out = [];
    for (const item of items) {
      const sale = await db.sales.get(item.sale_id);
      if (sale && sale.status !== "DRAFT") out.push({ item, sale });
    }
    return out.sort((a, b) => b.sale.sale_date.localeCompare(a.sale.sale_date));
  }, [productId]);

  return (
    <section className="card stack stack-md" aria-labelledby="ps-title">
      <h2 id="ps-title">Satışlar</h2>
      {rows === undefined ? null : rows.length === 0 ? (
        <p>Bu ürün için satış kaydı yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Satışlar">
          {rows.slice(0, LIMIT).map(({ item, sale }) => (
            <li key={item.id}>
              <Link href={`/sales/${sale.id}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span className="row row-between" style={{ width: "100%" }}>
                  <span>{sale.document_no}</span>
                  <strong>{formatCurrency(item.line_total)}</strong>
                </span>
                <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                  {formatDate(sale.sale_date)} · {formatQuantity(item.quantity)} {item.unit} × {formatCurrency(item.unit_price_snapshot)} ·{" "}
                  {SALE_STATUS_LABEL[sale.status]}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
