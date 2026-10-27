import type { Metadata } from "next";
import Link from "next/link";
import { Greeting } from "@/components/layout/Greeting";
import { QuickActions } from "@/components/layout/QuickActions";
import { RecentServices } from "@/components/layout/RecentServices";
import { TodayStatus } from "@/components/layout/TodayStatus";

export const metadata: Metadata = {
  title: "Ana Sayfa",
};

export default function DashboardPage() {
  return (
    <>
      <Greeting />

      <h2 className="section-title">Hızlı eylemler</h2>
      <QuickActions />

      <h2 className="section-title">Bugünün durumu</h2>
      <TodayStatus />

      <h2 className="section-title">
        Devam eden servisler
        <Link href="/services">Tümü</Link>
      </h2>
      <RecentServices />
    </>
  );
}
