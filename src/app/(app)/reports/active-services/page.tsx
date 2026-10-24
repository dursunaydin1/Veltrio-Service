import type { Metadata } from "next";
import { ActiveServicesScreen } from "@/components/reports/ReportScreens";

export const metadata: Metadata = { title: "Aktif servisler" };

export default function Page() {
  return <ActiveServicesScreen />;
}
