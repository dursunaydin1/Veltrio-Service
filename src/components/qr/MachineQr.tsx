"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { machineTitleOf } from "@/lib/machines/title";
import { QrLabel } from "@/components/qr/QrLabel";
import { PageHead } from "@/components/layout/PageHead";

/** Makine QR etiketi: kısa kimlik olarak iç numara ve makine adı basılır. */
export function MachineQr({ id }: { id: string }) {
  const machine = useLiveQuery(() => db.machines.get(id), [id]);
  if (machine === undefined) return null;
  return (
    <section className="stack stack-md">
      <PageHead title="Makine QR etiketi" action={<Link href={`/machines/${id}`} className="btn btn-secondary btn-sm no-print">Makineye dön</Link>} />
      <QrLabel kind="machine" id={id} title={machine?.internal_number ?? id.slice(0, 8)} subtitle={machine ? machineTitleOf(machine) : undefined} />
    </section>
  );
}
