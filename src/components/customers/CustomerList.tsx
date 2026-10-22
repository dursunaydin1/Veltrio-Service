"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { formatPhone } from "@/lib/utils/phone";
import { foldText } from "@/lib/utils/search";
import type { Customer } from "@/types";

/** Arama: harf içeriyorsa ad/köy/adreste kelime kelime; yalnızca rakamsa telefonda (baştaki 0 yok sayılır). */
export function matchesCustomer(customer: Customer, query: string): boolean {
  if (!query.trim()) return true;

  if (!/\p{L}/u.test(query)) {
    const digits = query.replace(/\D/g, "").replace(/^0/, "");
    return digits.length >= 3 && (customer.phone_normalized ?? "").includes(digits);
  }

  const text = [customer.name, customer.village, customer.address]
    .filter(Boolean)
    .map((v) => foldText(String(v)))
    .join(" ");
  return foldText(query.trim()).split(/\s+/).every((word) => text.includes(word));
}

/** Müşteri listesi: ad, telefon veya köye göre arama (Adım 3.2). */
export function CustomerList() {
  const businessId = useSessionStore((s) => s.business?.id);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const customers = useLiveQuery(
    () => (businessId ? db.customers.where("business_id").equals(businessId).toArray() : []),
    [businessId]
  );

  const visible = useMemo(() => {
    return (customers ?? [])
      .filter((c) => (showArchived ? true : !c.archived_at))
      .filter((c) => matchesCustomer(c, query))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [customers, query, showArchived]);

  return (
    <section className="stack stack-md">
      <div className="row row-between">
        <h1>Müşteriler</h1>
        <Link href="/customers/new" className="btn btn-primary btn-sm">
          <Plus size={18} aria-hidden="true" />
          Yeni müşteri
        </Link>
      </div>

      <input
        className="form-input"
        type="search"
        placeholder="Ad, telefon veya köy ara"
        aria-label="Müşteri ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Arşivlenmiş müşterileri de göster
      </label>

      {customers === undefined ? null : visible.length === 0 ? (
        <div className="alert alert-warning" role="note">
          {customers.length === 0
            ? "Henüz müşteri eklenmemiş. “Yeni müşteri” ile ilk müşteriyi ekleyin."
            : "Aramanıza uyan müşteri yok."}
        </div>
      ) : (
        <ul className="menu-list" aria-label="Müşteriler">
          {visible.map((c) => (
            <li key={c.id}>
              <Link href={`/customers/${c.id}`} style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                <span className="row row-between" style={{ width: "100%", gap: 8 }}>
                  <span>{c.name}</span>
                  {c.archived_at ? <span className="badge badge-gray">Arşivde</span> : null}
                </span>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
                  {[c.village, c.phone ? formatPhone(c.phone) : "Telefon yok"].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
