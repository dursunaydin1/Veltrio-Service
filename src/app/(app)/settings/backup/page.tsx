import type { Metadata } from "next";
import { BackupManager } from "@/components/settings/BackupManager";

export const metadata: Metadata = { title: "Yedekleme" };

export default function BackupPage() {
  return <BackupManager />;
}
