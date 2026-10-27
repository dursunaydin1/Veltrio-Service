import type { Metadata } from "next";
import { ServiceForm } from "@/components/services/ServiceForm";

export const metadata: Metadata = { title: "Yeni servis" };

export default async function NewServicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; machine?: string }>;
}) {
  const { customer, machine } = await searchParams;
  return <ServiceForm initialCustomerId={customer} initialMachineId={machine} />;
}
