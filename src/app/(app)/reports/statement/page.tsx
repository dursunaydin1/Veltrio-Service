import type { Metadata } from "next";
import { StatementScreen } from "@/components/reports/ReportScreens";

export const metadata: Metadata = { title: "Hesap ekstresi" };

export default function Page() {
  return <StatementScreen />;
}
