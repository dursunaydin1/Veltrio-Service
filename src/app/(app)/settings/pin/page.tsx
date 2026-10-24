import type { Metadata } from "next";
import { PinSettings } from "@/components/settings/PinSettings";

export const metadata: Metadata = { title: "Cihaz PIN kodu" };

export default function PinPage() {
  return <PinSettings />;
}
