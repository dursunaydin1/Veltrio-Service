import type { Metadata } from "next";
import { SupplierList } from "@/components/suppliers/SupplierList";

export const metadata: Metadata = { title: "Tedarikçiler" };

export default function SuppliersPage() {
  return <SupplierList />;
}
