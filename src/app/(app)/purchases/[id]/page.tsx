import type { Metadata } from "next";
import { PurchaseDetail } from "@/components/purchases/PurchaseDetail";

export const metadata: Metadata = { title: "Alım" };

export default async function PurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseDetail id={id} />;
}
