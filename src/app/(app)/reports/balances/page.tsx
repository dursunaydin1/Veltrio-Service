import type { Metadata } from "next";
import { BalanceReport } from "@/components/finance/BalanceReport";

export const metadata: Metadata = { title: "Bakiyeler" };

export default function BalancesPage() {
  return <BalanceReport />;
}
