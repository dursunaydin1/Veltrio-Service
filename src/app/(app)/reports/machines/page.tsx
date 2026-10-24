import type { Metadata } from "next";
import { MachineHistoryScreen } from "@/components/reports/ReportScreens";

export const metadata: Metadata = { title: "Makine geçmişi" };

export default function Page() {
  return <MachineHistoryScreen />;
}
