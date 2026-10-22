"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { PURCHASE_STATUS_BADGE, PURCHASE_STATUS_LABEL } from "@/components/purchases/PurchaseList";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Supplier } from "@/types";

/** Tedarikçi profilindeki alım geçmişi (Adım 4.5). */
export function SupplierPurchases({ supplier }: { supplier: Supplier }) {
  const purchases = useLiveQuery(async () => {
    const all = await db.purchases.where("supplier_id").equals(supplier.id).toArray();
    return all.sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
  }, [supplier.id]);

  return (
    <section className="card stack stack-md" aria-labelledby="sp-title">
      <div className="row row-between">
        <h2 id="sp-title">Alımlar</h2>
        <Link href={`/purchases/new?supplier=${supplier.id}`} className="btn btn-secondary btn-sm">
          <Plus size={18} aria-hidden="true" />
          Yeni alım
        </Link>
      </div>
      {purchases === undefined ? null : purchases.length === 0 ? (
        <p>Bu tedarikçiden alım kaydı yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Tedarikçinin alımları">
          {purchases.slice(0, 20).map((p) => (
            <li key={p.id}>
              <Link href={`/purchases/${p.id}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span className="row row-between" style={{ width: "100%" }}>
                  <span>{p.document_no}</span>
                  <strong>{formatCurrency(p.total_amount)}</strong>
                </span>
                <span className="row row-gap-sm">
                  <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>{formatDate(p.purchase_date)}</small>
                  <span className={`badge ${PURCHASE_STATUS_BADGE[p.status]}`}>{PURCHASE_STATUS_LABEL[p.status]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
