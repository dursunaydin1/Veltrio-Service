import type { Metadata } from "next";
import { CustomerEditor } from "@/components/customers/CustomerEditor";

export const metadata: Metadata = { title: "Müşteri" };

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerEditor id={id} />;
}
