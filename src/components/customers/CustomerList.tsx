"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListSkeleton, initials } from "@/components/common/ListSkeleton";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { formatPhone } from "@/lib/utils/phone";
import { foldText } from "@/lib/utils/search";
import type { Customer } from "@/types";
import { PageHead } from "@/components/layout/PageHead";

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
      <PageHead title="Müşteriler" addHref="/customers/new" addLabel="Müşteri ekle" />

      <input
        className="form-input"
        type="search"
        placeholder="Ad, telefon veya köy ara"
        aria-label="Müşteri ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <label className="toggle-row toggle-inline">
        <span>Arşivlenmiş müşterileri de göster</span>
        <input type="checkbox" className="switch" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      </label>

      {customers === undefined ? <ListSkeleton /> : visible.length === 0 ? (
        <div className="empty-state" role="note">
          {customers.length === 0
            ? "Henüz müşteri eklenmemiş. Üstteki “Müşteri ekle” ile ilkini ekleyin."
            : "Aramanıza uyan müşteri yok."}
        </div>
      ) : (
        <ul className="menu-list" aria-label="Müşteriler">
          {visible.map((c) => (
            <li key={c.id}>
              <Link href={`/customers/${c.id}`}>
                {c.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo} alt="" className="avatar avatar-sm avatar-photo" />
                ) : (
                  <span className="avatar avatar-sm menu-avatar monogram" aria-hidden="true">{initials(c.name)}</span>
                )}
                <span className="list-main">
                <span className="list-title">
                  <span>{c.name}</span>
                  {c.archived_at ? <span className="badge badge-gray">Arşivde</span> : null}
                </span>
                <span className="list-sub">
                  {[c.village, c.phone ? formatPhone(c.phone) : "Telefon yok"].filter(Boolean).join(" · ")}
                </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
