"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { isOpenStatus } from "@/lib/services/status";
import { machineTitle } from "@/components/machines/MachineList";
import { StatusBadge } from "@/components/services/StatusBadge";
import { useSessionStore } from "@/stores/session";

/** Ana ekranda en son güncellenen açık servisler (en fazla 5). */
export function RecentServices() {
  const businessId = useSessionStore((s) => s.business?.id);

  const data = useLiveQuery(async () => {
    if (!businessId) return [];
    const open = await db.services
      .where("business_id")
      .equals(businessId)
      .filter((s) => isOpenStatus(s.status))
      .toArray();
    const recent = open.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")).slice(0, 5);
    const customers = await db.customers.bulkGet(recent.map((s) => s.customer_id ?? ""));
    const machines = await db.machines.bulkGet(recent.map((s) => s.machine_id ?? ""));
    return recent.map((s, i) => ({
      service: s,
      customer: customers[i]?.name,
      machine: machines[i] ? machineTitle(machines[i]) : undefined,
    }));
  }, [businessId]);

  if (data === undefined) return null;
  if (data.length === 0) {
    return (
      <div className="empty-state">
        <strong>Açık servis yok</strong>
        <span>Yeni bir makine geldiğinde “Yeni Servis” ile kaydı açın.</span>
      </div>
    );
  }

  return (
    <ul className="menu-list" aria-label="Devam eden servisler">
      {data.map(({ service, customer, machine }) => (
        <li key={service.id}>
          <Link href={`/services/${service.id}`} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
            <span className="row row-between" style={{ gap: 8 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {customer ?? "Müşterisiz"}
              </span>
              <StatusBadge status={service.status} />
            </span>
            <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>
              {[service.document_no, machine].filter(Boolean).join(" · ")}
            </small>
          </Link>
        </li>
      ))}
    </ul>
  );
}
