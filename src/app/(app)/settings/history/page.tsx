import type { Metadata } from "next";
import { AuditHistory } from "@/components/settings/AuditHistory";

export const metadata: Metadata = { title: "Geçmiş" };

export default function HistoryPage() {
  return <AuditHistory />;
}
