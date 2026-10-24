import type { Metadata } from "next";
import { DeviceManager } from "@/components/settings/DeviceManager";

export const metadata: Metadata = { title: "Cihazlar" };

export default function DevicesPage() {
  return <DeviceManager />;
}
