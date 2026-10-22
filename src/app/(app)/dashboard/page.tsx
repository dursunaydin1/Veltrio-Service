import type { Metadata } from "next";
import { QuickActions } from "@/components/layout/QuickActions";
import { TodayStatus } from "@/components/layout/TodayStatus";

export const metadata: Metadata = {
  title: "Ana Sayfa",
};

export default function DashboardPage() {
  return (
    <>
      <h1>Ana Sayfa</h1>

      <h2 className="section-title">Hızlı eylemler</h2>
      <QuickActions />

      <h2 className="section-title">Bugünün durumu</h2>
      <TodayStatus />
    </>
  );
}
