"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { machineTitleOf } from "@/lib/machines/title";
import type { Machine } from "@/types";
import { PageHead } from "@/components/layout/PageHead";
import { useIncremental } from "@/hooks/useIncremental";
import { LoadMore } from "@/components/common/LoadMore";
import { matchesMachine } from "@/lib/search/match";


/** Makine listesi: marka, model, seri no, iç numara veya sahibe göre arama (Adım 3.3). */
export function MachineList() {
  const businessId = useSessionStore((s) => s.business?.id);
  // İlk indirme sürerken boş liste "henüz kayıt yok" demesin
  const pullingAll = useSessionStore((s) => s.pullingAll);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const data = useLiveQuery(async () => {
    if (!businessId) return { machines: [] as Machine[], owners: new Map<string, string>() };
    const [machines, customers] = await Promise.all([
      db.machines.where("business_id").equals(businessId).toArray(),
      db.customers.where("business_id").equals(businessId).toArray(),
    ]);
    return { machines, owners: new Map(customers.map((c) => [c.id, c.name])) };
  }, [businessId]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.machines
      .filter((m) => !m.merged_into_id && (showArchived || !m.archived_at))
      .filter((m) => matchesMachine(m, data.owners.get(m.customer_id ?? "") ?? "", query))
      .sort((a, b) => machineTitleOf(a).localeCompare(machineTitleOf(b), "tr"));
  }, [data, query, showArchived]);
  const shown = useIncremental(visible);

  return (
    <section className="stack stack-md">
      <PageHead title="Makineler" addHref="/machines/new" addLabel="Makine ekle" />

      {/* Aşağı kaydırınca arama kutusu üstte kalır (K-097) */}
      <div className="list-toolbar">
        <input
          className="form-input"
          type="search"
          placeholder="Marka, model, seri no veya sahip ara"
          aria-label="Makine ara"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <label className="toggle-row toggle-inline">
        <span>Arşivlenmiş makineleri de göster</span>
        <input type="checkbox" className="switch" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      </label>

      {data === undefined || (pullingAll && visible.length === 0) ? <ListSkeleton /> : visible.length === 0 ? (
        <div className="empty-state" role="note">
          {data.machines.length === 0
            ? "Henüz makine eklenmemiş. Üstteki “Makine ekle” ile ilkini ekleyin."
            : "Aramanıza uyan makine yok."}
        </div>
      ) : (
        <>
        <ul className="menu-list" aria-label="Makineler">
          {shown.items.map((m) => (
            <li key={m.id}>
              <Link href={`/machines/${m.id}`} className="item-stack">
                <span className="row row-between w-full gap-2">
                  <span>{machineTitleOf(m)}</span>
                  <span className="row row-gap-sm">
                    {m.is_temporary ? <span className="badge badge-yellow">Geçici</span> : null}
                    {m.archived_at ? <span className="badge badge-gray">Arşivde</span> : null}
                  </span>
                </span>
                <span className="meta-strong">
                  {[m.type, m.serial_number ?? m.internal_number, data.owners.get(m.customer_id ?? "")]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {shown.hasMore ? <LoadMore remaining={shown.remaining} onMore={shown.next} /> : null}
      </>
      )}
    </section>
  );
}
