import type { Metadata } from "next";
import { StockReportScreen } from "@/components/reports/ReportScreens";

export const metadata: Metadata = { title: "Stok raporu" };

export default function Page() {
  return <StockReportScreen />;
}
