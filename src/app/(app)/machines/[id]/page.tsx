import type { Metadata } from "next";
import { MachineEditor } from "@/components/machines/MachineEditor";

export const metadata: Metadata = { title: "Makine" };

export default async function MachinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MachineEditor id={id} />;
}
