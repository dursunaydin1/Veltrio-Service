import type { Metadata } from "next";
import { StaffManager } from "@/components/settings/StaffManager";

export const metadata: Metadata = { title: "Çalışanlar" };

export default function StaffPage() {
  return <StaffManager />;
}
