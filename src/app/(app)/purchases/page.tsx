import type { Metadata } from "next";
import { PurchaseList } from "@/components/purchases/PurchaseList";

export const metadata: Metadata = { title: "Satın Almalar" };

export default function PurchasesPage() {
  return <PurchaseList />;
}
