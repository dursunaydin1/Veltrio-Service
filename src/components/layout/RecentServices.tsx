"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { describePromise } from "@/lib/services/promise";
import { isOpenStatus, statusTone } from "@/lib/services/status";
import { machineTitle } from "@/components/machines/MachineList";
import { StatusBadge } from "@/components/services/StatusBadge";
import { todayLocalDate } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";

/** Ana ekranda açık servisler: önce teslimi en yakın / gecikmiş olanlar (en fazla 6). */
export function RecentServices() {
  const businessId = useSessionStore((s) => s.business?.id);

  const data = useLiveQuery(async () => {
    if (!businessId) return [];
    const open = await db.services
      .where("business_id")
      .equals(businessId)
      .filter((s) => isOpenStatus(s.status))
      .toArray();
    // Teslim tarihi olanlar tarihe göre önde; olmayanlar en son güncellenene göre
    const recent = open
      .sort((a, b) => {
        if (a.promised_date && b.promised_date) return a.promised_date.localeCompare(b.promised_date);
        if (a.promised_date) return -1;
        if (b.promised_date) return 1;
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      })
      .slice(0, 6);
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
        <span>Yeni bir makine geldiğinde aşağıdaki + düğmesiyle kaydı açın.</span>
      </div>
    );
  }

  const today = todayLocalDate();
  return (
    <ul className="card-list" aria-label="Devam eden servisler">
      {data.map(({ service, customer, machine }) => {
        const promise = describePromise(service.promised_date, today);
        return (
          <li key={service.id}>
            <Link href={`/services/${service.id}`} className="item-card">
              <span className="avatar" data-tone={statusTone(service.status)} aria-hidden="true">
                <Wrench size={20} />
              </span>
              <span className="item-main">
                <span className="item-title">{customer ?? "Müşterisiz"}</span>
                <span className="item-sub">{machine ?? service.document_no}</span>
                <span className="item-meta">
                  <StatusBadge status={service.status} />
                  {promise ? <span data-tone={promise.tone}>{promise.text}</span> : null}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
