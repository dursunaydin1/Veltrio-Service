"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { machineTitle } from "@/components/machines/MachineList";
import { QrLabel } from "@/components/qr/QrLabel";

/** Makine QR etiketi: kısa kimlik olarak iç numara ve makine adı basılır. */
export function MachineQr({ id }: { id: string }) {
  const machine = useLiveQuery(() => db.machines.get(id), [id]);
  if (machine === undefined) return null;
  return (
    <section className="stack stack-md">
      <div className="no-print row row-between">
        <h1>Makine QR etiketi</h1>
        <Link href={`/machines/${id}`} className="btn btn-secondary btn-sm">Makineye dön</Link>
      </div>
      <QrLabel kind="machine" id={id} title={machine?.internal_number ?? id.slice(0, 8)} subtitle={machine ? machineTitle(machine) : undefined} />
    </section>
  );
}
