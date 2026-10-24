import type { Metadata } from "next";
import { CollectionsReportScreen } from "@/components/reports/ReportScreens";

export const metadata: Metadata = { title: "Tahsilat raporu" };

export default function Page() {
  return <CollectionsReportScreen />;
}
