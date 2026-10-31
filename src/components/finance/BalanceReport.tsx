"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { AGING_BANDS, type AgingBandId } from "@/lib/finance/aging";
import { getCustomerOpenItems } from "@/lib/finance/openItems";
import { getSupplierBalance } from "@/lib/finance/service";
import { formatCurrency } from "@/lib/utils";

const money = (kurus: number) => formatCurrency(kurus / 100);

type CustomerRow = {
  id: string;
  name: string;
  balanceKurus: number;
  creditKurus: number;
  overdueKurus: number;
  aging: Record<AgingBandId, number>;
};
type SupplierRow = { id: string; name: string; balanceKurus: number };

type Tab = "CUSTOMERS" | "SUPPLIERS";

/** Müşteri ve tedarikçi bakiye listeleri, yaşlandırma özeti (Adım 5.8, §15). */
export function BalanceReport() {
  const businessId = useSessionStore((s) => s.business?.id);
  const [tab, setTab] = useState<Tab>("CUSTOMERS");

  const customers = useLiveQuery(async (): Promise<CustomerRow[] | undefined> => {
    if (!businessId) return undefined;
    const all = await db.customers.where("business_id").equals(businessId).toArray();
    const rows: CustomerRow[] = [];
    for (const c of all) {
      const open = await getCustomerOpenItems(businessId, c.id);
      if (open.balanceKurus === 0 && open.openKurus === 0) continue;
      const overdue = open.aging.D8_30 + open.aging.D31_60 + open.aging.D60_PLUS;
      rows.push({ id: c.id, name: c.name, balanceKurus: open.balanceKurus, creditKurus: open.creditKurus, overdueKurus: overdue, aging: open.aging });
    }
    return rows.sort((a, b) => b.balanceKurus - a.balanceKurus);
  }, [businessId]);

  const suppliers = useLiveQuery(async (): Promise<SupplierRow[] | undefined> => {
    if (!businessId) return undefined;
    const all = await db.suppliers.where("business_id").equals(businessId).toArray();
    const rows: SupplierRow[] = [];
    for (const s of all) {
      const b = await getSupplierBalance(businessId, s.id);
      if (b.balance !== 0) rows.push({ id: s.id, name: s.name, balanceKurus: b.balance });
    }
    return rows.sort((a, b) => b.balanceKurus - a.balanceKurus);
  }, [businessId]);

  const customerTotals = useMemo(() => {
    const debt = (customers ?? []).filter((r) => r.balanceKurus > 0).reduce((a, r) => a + r.balanceKurus, 0);
    const credit = (customers ?? []).filter((r) => r.balanceKurus < 0).reduce((a, r) => a - r.balanceKurus, 0);
    const aging = Object.fromEntries(AGING_BANDS.map((b) => [b.id, 0])) as Record<AgingBandId, number>;
    for (const r of customers ?? []) for (const b of AGING_BANDS) aging[b.id] += r.aging[b.id];
    return { debt, credit, aging };
  }, [customers]);

  const supplierTotals = useMemo(() => {
    const owed = (suppliers ?? []).filter((r) => r.balanceKurus > 0).reduce((a, r) => a + r.balanceKurus, 0);
    const receivable = (suppliers ?? []).filter((r) => r.balanceKurus < 0).reduce((a, r) => a - r.balanceKurus, 0);
    return { owed, receivable };
  }, [suppliers]);

  return (
    <section className="stack stack-md">
      <h1>Bakiyeler</h1>
      <div role="tablist" aria-label="Bakiye türü">
        {([["CUSTOMERS", "Müşteriler"], ["SUPPLIERS", "Tedarikçiler"]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "CUSTOMERS" ? (
        <>
          <div className="tile-grid">
            <div className="tile">
              <div className="tile-label">Toplam alacağınız</div>
              <div className="tile-value" style={{ color: customerTotals.debt > 0 ? "var(--accent-warning)" : undefined }}>{money(customerTotals.debt)}</div>
            </div>
            <div className="tile">
              <div className="tile-label">Müşteri alacakları (size borçlu olmayan)</div>
              <div className="tile-value" style={{ color: customerTotals.credit > 0 ? "var(--accent-success)" : undefined }}>{money(customerTotals.credit)}</div>
            </div>
          </div>
          <div className="tile-grid" aria-label="Yaşlandırma">
            {AGING_BANDS.map((b) => (
              <div className="tile" key={b.id}>
                <div className="tile-label">{b.label}</div>
                <div className="tile-value">{money(customerTotals.aging[b.id])}</div>
              </div>
            ))}
          </div>
          {customers === undefined ? null : customers.length === 0 ? (
            <div className="empty-state" role="note">Bakiyesi olan müşteri yok.</div>
          ) : (
            <ul className="menu-list" aria-label="Müşteri bakiyeleri">
              {customers.map((r) => (
                <li key={r.id}>
                  <Link href={`/customers/${r.id}`} style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                    <span className="row row-between" style={{ width: "100%", gap: 8 }}>
                      <span>{r.name}</span>
                      <strong style={{ color: r.balanceKurus > 0 ? "var(--accent-warning)" : "var(--accent-success)" }}>
                        {r.balanceKurus > 0 ? money(r.balanceKurus) : `${money(-r.balanceKurus)} alacaklı`}
                      </strong>
                    </span>
                    {r.overdueKurus > 0 ? (
                      <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>8 günü geçen: {money(r.overdueKurus)}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="tile-grid">
            <div className="tile">
              <div className="tile-label">Tedarikçilere borcunuz</div>
              <div className="tile-value" style={{ color: supplierTotals.owed > 0 ? "var(--accent-warning)" : undefined }}>{money(supplierTotals.owed)}</div>
            </div>
            <div className="tile">
              <div className="tile-label">Tedarikçilerden alacağınız</div>
              <div className="tile-value" style={{ color: supplierTotals.receivable > 0 ? "var(--accent-success)" : undefined }}>{money(supplierTotals.receivable)}</div>
            </div>
          </div>
          {suppliers === undefined ? null : suppliers.length === 0 ? (
            <div className="empty-state" role="note">Bakiyesi olan tedarikçi yok.</div>
          ) : (
            <ul className="menu-list" aria-label="Tedarikçi bakiyeleri">
              {suppliers.map((r) => (
                <li key={r.id}>
                  <Link href={`/suppliers/${r.id}`}>
                    <span className="row row-between" style={{ width: "100%", gap: 8 }}>
                      <span>{r.name}</span>
                      <strong style={{ color: r.balanceKurus > 0 ? "var(--accent-warning)" : "var(--accent-success)" }}>
                        {r.balanceKurus > 0 ? `${money(r.balanceKurus)} borç` : `${money(-r.balanceKurus)} alacak`}
                      </strong>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
