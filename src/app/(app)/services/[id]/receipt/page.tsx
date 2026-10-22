import type { Metadata } from "next";
import { ReceiptView } from "@/components/services/ReceiptView";

export const metadata: Metadata = { title: "Servis fişi" };

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  return <ReceiptView serviceId={id} type={type === "summary" ? "summary" : "intake"} />;
}
