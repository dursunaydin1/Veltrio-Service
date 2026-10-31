import type { Metadata } from "next";
import { MachineForm } from "@/components/machines/MachineForm";

export const metadata: Metadata = { title: "Yeni makine" };

export default async function NewMachinePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  return (
    <section className="stack stack-md">
      <h1>Makine ekle</h1>
      <MachineForm initialCustomerId={customer} />
    </section>
  );
}
