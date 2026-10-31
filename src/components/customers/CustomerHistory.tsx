"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { StatusBadge } from "@/components/services/StatusBadge";
import { SALE_STATUS_BADGE, SALE_STATUS_LABEL } from "@/components/sales/SaleList";
import type { Customer } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";

const LIMIT = 10;

/** Müşteri profilinde servis geçmişi ve satışlar; hızlı işlemler (Adım 3.2). */
export function CustomerHistory({ customer }: { customer: Customer }) {
  const services = useLiveQuery(async () => {
    const all = await db.services.where("customer_id").equals(customer.id).toArray();
    return all.sort((a, b) => b.received_date.localeCompare(a.received_date));
  }, [customer.id]);
  const sales = useLiveQuery(async () => {
    const all = await db.sales.where("customer_id").equals(customer.id).filter((s) => s.status !== "DRAFT").toArray();
    return all.sort((a, b) => b.sale_date.localeCompare(a.sale_date));
  }, [customer.id]);
  const archived = !!customer.archived_at;

  return (
    <>
      {!archived ? (
        <div className="row row-gap-md" aria-label="Hızlı işlemler">
          <Link href={`/services/new?customer=${customer.id}`} className="btn btn-primary" style={{ flex: 1 }}>Servis aç</Link>
          <Link href={`/sales/new?customer=${customer.id}`} className="btn btn-secondary" style={{ flex: 1 }}>Satış yap</Link>
        </div>
      ) : null}

      <section className="card stack stack-md" aria-labelledby="ch-services">
        <h2 id="ch-services">Servis geçmişi</h2>
        {services === undefined ? null : services.length === 0 ? (
          <p>Bu müşterinin servis kaydı yok.</p>
        ) : (
          <ul className="menu-list" aria-label="Servisler">
            {services.slice(0, LIMIT).map((s) => (
              <li key={s.id}>
                <Link href={`/services/${s.id}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                  <span className="row row-between" style={{ width: "100%" }}>
                    <span>{s.document_no}</span>
                    <StatusBadge status={s.status} />
                  </span>
                  <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                    {formatDate(s.received_date)} · {s.customer_complaint ?? ""}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {services && services.length > LIMIT ? <small style={{ color: "var(--text-muted)" }}>Son {LIMIT} servis gösteriliyor.</small> : null}
      </section>

      <section className="card stack stack-md" aria-labelledby="ch-sales">
        <h2 id="ch-sales">Satışlar</h2>
        {sales === undefined ? null : sales.length === 0 ? (
          <p>Bu müşteriye satış yok.</p>
        ) : (
          <ul className="menu-list" aria-label="Satışlar">
            {sales.slice(0, LIMIT).map((s) => (
              <li key={s.id}>
                <Link href={`/sales/${s.id}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                  <span className="row row-between" style={{ width: "100%" }}>
                    <span>{s.document_no}</span>
                    <strong>{formatCurrency(s.total_amount)}</strong>
                  </span>
                  <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                    {formatDate(s.sale_date)} · <span className={`badge ${SALE_STATUS_BADGE[s.status]}`}>{SALE_STATUS_LABEL[s.status]}</span>
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {sales && sales.length > LIMIT ? <small style={{ color: "var(--text-muted)" }}>Son {LIMIT} satış gösteriliyor.</small> : null}
      </section>
    </>
  );
}
