import type { Metadata } from "next";
import { BusinessSettingsForm } from "@/components/settings/BusinessSettingsForm";

export const metadata: Metadata = { title: "İşletme ayarları" };

export default function BusinessSettingsPage() {
  return <BusinessSettingsForm />;
}
