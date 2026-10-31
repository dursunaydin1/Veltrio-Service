"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import { machineTitleOf } from "@/lib/machines/title";
import { foldText } from "@/lib/utils/search";
import type { Machine } from "@/types";
import { PageHead } from "@/components/layout/PageHead";

/** Arama: tür, marka, model, seri / iç numara ve sahibin adı üzerinde kelime kelime. */
export function matchesMachine(machine: Machine, ownerName: string, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [
    machine.type,
    machine.brand,
    machine.model,
    machine.serial_number,
    machine.internal_number,
    ownerName,
  ]
    .filter(Boolean)
    .map((v) => foldText(String(v)))
    .join(" ");
  return foldText(query.trim()).split(/\s+/).every((word) => haystack.includes(word));
}

export const machineTitle = machineTitleOf;

/** Makine listesi: marka, model, seri no, iç numara veya sahibe göre arama (Adım 3.3). */
export function MachineList() {
  const businessId = useSessionStore((s) => s.business?.id);
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
      .sort((a, b) => machineTitle(a).localeCompare(machineTitle(b), "tr"));
  }, [data, query, showArchived]);

  return (
    <section className="stack stack-md">
      <PageHead title="Makineler" addHref="/machines/new" addLabel="Makine ekle" />

      <input
        className="form-input"
        type="search"
        placeholder="Marka, model, seri no veya sahip ara"
        aria-label="Makine ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Arşivlenmiş makineleri de göster
      </label>

      {data === undefined ? <ListSkeleton /> : visible.length === 0 ? (
        <div className="empty-state" role="note">
          {data.machines.length === 0
            ? "Henüz makine eklenmemiş. Üstteki “Makine ekle” ile ilkini ekleyin."
            : "Aramanıza uyan makine yok."}
        </div>
      ) : (
        <ul className="menu-list" aria-label="Makineler">
          {visible.map((m) => (
            <li key={m.id}>
              <Link href={`/machines/${m.id}`} style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
                <span className="row row-between" style={{ width: "100%", gap: 8 }}>
                  <span>{machineTitle(m)}</span>
                  <span className="row row-gap-sm">
                    {m.is_temporary ? <span className="badge badge-yellow">Geçici</span> : null}
                    {m.archived_at ? <span className="badge badge-gray">Arşivde</span> : null}
                  </span>
                </span>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
                  {[m.type, m.serial_number ?? m.internal_number, data.owners.get(m.customer_id ?? "")]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
