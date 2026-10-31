"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { useLiveQuery } from "dexie-react-hooks";
import { Wrench } from "lucide-react";
import { db } from "@/lib/db";
import type { Service } from "@/lib/db";
import { machineTitle } from "@/components/machines/MachineList";
import { getServiceBalance } from "@/lib/services/service";
import { StatusBadge } from "@/components/services/StatusBadge";
import { useSessionStore } from "@/stores/session";
import { isOpenStatus, statusTone } from "@/lib/services/status";
import { foldText } from "@/lib/utils/search";
import { formatCurrency, formatDate, todayLocalDate } from "@/lib/utils";
import { PageHead } from "@/components/layout/PageHead";

type Tab = "active" | "delivered" | "cancelled";

const TABS: { id: Tab; label: string }[] = [
  { id: "active", label: "Aktif" },
  { id: "delivered", label: "Teslim edilen" },
  { id: "cancelled", label: "İptal" },
];

export function inTab(service: Pick<Service, "status">, tab: Tab): boolean {
  if (tab === "active") return isOpenStatus(service.status);
  if (tab === "delivered") return service.status === "DELIVERED";
  return service.status === "CANCELLED";
}

/** Teslim sözü geçmiş açık servis mi? */
export function isOverdue(service: Pick<Service, "status" | "promised_date">, today: string): boolean {
  return isOpenStatus(service.status) && !!service.promised_date && service.promised_date < today;
}

/** Arama: belge no, müşteri, makine (marka/model/seri/iç no). */
export function matchesService(service: Service, customerName: string, machineText: string, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = foldText([service.document_no, customerName, machineText, service.customer_complaint].filter(Boolean).join(" "));
  return foldText(query.trim()).split(/\s+/).every((word) => haystack.includes(word));
}

/** Servis listesi: aktif / teslim edilen / iptal sekmeleri, arama, teslim sözü (Adım 3.17). */
export function ServiceList() {
  const businessId = useSessionStore((s) => s.business?.id);
  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");

  const data = useLiveQuery(async () => {
    if (!businessId) return undefined;
    const [services, customers, machines] = await Promise.all([
      db.services.where("business_id").equals(businessId).toArray(),
      db.customers.where("business_id").equals(businessId).toArray(),
      db.machines.where("business_id").equals(businessId).toArray(),
    ]);
    // Bakiye göstergesi: tamamlanmış (faturalanmış) servislerde kalan tutar
    const balances = new Map<string, number>();
    for (const s of services) {
      if (s.first_completed_at && s.status !== "CANCELLED") balances.set(s.id, (await getServiceBalance(s.id)).remaining);
    }
    return {
      balances,
      services,
      customers: new Map(customers.map((c) => [c.id, c.name])),
      machines: new Map(
        machines.map((m) => [
          m.id,
          { title: machineTitle(m), text: [machineTitle(m), m.type, m.serial_number, m.internal_number].filter(Boolean).join(" ") },
        ])
      ),
    };
  }, [businessId]);

  const today = todayLocalDate();
  const visible = useMemo(() => {
    if (!data) return [];
    return data.services
      .filter((s) => inTab(s, tab))
      .filter((s) =>
        matchesService(s, data.customers.get(s.customer_id ?? "") ?? "", data.machines.get(s.machine_id ?? "")?.text ?? "", query)
      )
      .sort((a, b) => b.received_date.localeCompare(a.received_date));
  }, [data, tab, query]);

  return (
    <section className="stack stack-md">
      <PageHead title="Servisler" addHref="/services/new" addLabel="Servis aç" />

      <div role="tablist" aria-label="Servis durumu">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        className="form-input"
        type="search"
        placeholder="Servis no, müşteri veya makine ara"
        aria-label="Servis ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {data === undefined ? <ListSkeleton /> : visible.length === 0 ? (
        <div className="empty-state" role="note">
          {data.services.length === 0
            ? "Henüz servis kaydı yok. Üstteki “Servis aç” ile ilkini açın."
            : "Bu sekmede / aramada servis yok."}
        </div>
      ) : (
        <ul className="menu-list" aria-label="Servisler">
          {visible.map((s) => {
            const overdue = isOverdue(s, today);
            return (
              <li key={s.id}>
                <Link href={`/services/${s.id}`}>
                  <span className="avatar avatar-sm" data-tone={statusTone(s.status)} aria-hidden="true">
                    <Wrench size={18} />
                  </span>
                  <span className="list-main">
                  <span className="list-title">
                    <span className="list-name">
                      {data.customers.get(s.customer_id ?? "") ?? "Müşterisiz"}
                    </span>
                    <StatusBadge status={s.status} />
                  </span>
                  <small className="list-sub">
                    {[s.document_no, data.machines.get(s.machine_id ?? "")?.title].filter(Boolean).join(" · ")}
                  </small>
                  {(data.balances.get(s.id) ?? 0) > 0 ? (
                    <small style={{ color: "var(--accent-warning)" }}>
                      Kalan: {formatCurrency((data.balances.get(s.id) ?? 0) / 100)}
                    </small>
                  ) : null}
                  {s.promised_date ? (
                    <small style={{ color: overdue ? "var(--accent-danger)" : "var(--text-muted)" }}>
                      Teslim sözü: {formatDate(s.promised_date + "T00:00:00")}
                      {overdue ? " (gecikmiş)" : ""}
                    </small>
                  ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
