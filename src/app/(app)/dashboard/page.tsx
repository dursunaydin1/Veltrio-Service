import type { Metadata } from "next";
import { Greeting } from "@/components/layout/Greeting";
import { QuickActions } from "@/components/layout/QuickActions";
import { RecentServices } from "@/components/layout/RecentServices";
import { TodayStatus } from "@/components/layout/TodayStatus";

export const metadata: Metadata = {
  title: "Ana Sayfa",
};

export default function DashboardPage() {
  return (
    <div className="stack stack-lg">
      <Greeting />
      <QuickActions />

      <TodayStatus />

      <RecentServices />
    </div>
  );
}
