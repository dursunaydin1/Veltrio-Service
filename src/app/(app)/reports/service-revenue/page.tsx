import type { Metadata } from "next";
import { ServiceRevenueScreen } from "@/components/reports/ReportScreens";

export const metadata: Metadata = { title: "Servis geliri" };

export default function Page() {
  return <ServiceRevenueScreen />;
}
