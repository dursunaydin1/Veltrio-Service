"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { machineTitle } from "@/components/machines/MachineList";
import type { Customer } from "@/types";

/** Müşteri profilindeki makineler bölümü (Adım 3.1-3.3). */
export function CustomerMachines({ customer }: { customer: Customer }) {
  const machines = useLiveQuery(
    () =>
      db.machines
        .where("customer_id")
        .equals(customer.id)
        .filter((m) => !m.archived_at && !m.merged_into_id)
        .toArray(),
    [customer.id]
  );

  return (
    <section className="card stack stack-md" aria-labelledby="cm-title">
      <div className="row row-between">
        <h2 id="cm-title">Makineler</h2>
        <Link href={`/machines/new?customer=${customer.id}`} className="btn btn-secondary btn-sm">
          <Plus size={18} aria-hidden="true" />
          Makine ekle
        </Link>
      </div>
      {machines === undefined ? null : machines.length === 0 ? (
        <p>Bu müşteriye kayıtlı makine yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Müşterinin makineleri">
          {machines.map((m) => (
            <li key={m.id}>
              <Link href={`/machines/${m.id}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span>{machineTitle(m)}</span>
                <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                  {[m.type, m.serial_number ?? m.internal_number].filter(Boolean).join(" · ")}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
