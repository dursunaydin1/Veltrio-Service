import type { Metadata } from "next";
import { SalesReportScreen } from "@/components/reports/ReportScreens";

export const metadata: Metadata = { title: "Satış raporu" };

export default function Page() {
  return <SalesReportScreen />;
}
