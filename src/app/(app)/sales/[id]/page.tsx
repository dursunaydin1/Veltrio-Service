import type { Metadata } from "next";
import { SaleDetail } from "@/components/sales/SaleDetail";

export const metadata: Metadata = { title: "Satış" };

export default async function SalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SaleDetail id={id} />;
}
