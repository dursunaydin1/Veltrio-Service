import type { Metadata } from "next";
import { SaleList } from "@/components/sales/SaleList";

export const metadata: Metadata = { title: "Satışlar" };

export default function SalesPage() {
  return <SaleList />;
}
