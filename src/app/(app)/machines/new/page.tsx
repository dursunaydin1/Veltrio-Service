import type { Metadata } from "next";
import { MachineForm } from "@/components/machines/MachineForm";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Yeni makine" };

export default async function NewMachinePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  return (
    <section className="stack stack-md">
      <PageHead title="Makine ekle" />
      <MachineForm initialCustomerId={customer} />
    </section>
  );
}
