import type { Metadata } from "next";
import { SupplierEditor } from "@/components/suppliers/SupplierEditor";

export const metadata: Metadata = { title: "Tedarikçi" };

export default async function SupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierEditor id={id} />;
}
