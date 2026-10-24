import type { Metadata } from "next";
import { TemplateManager } from "@/components/settings/TemplateManager";

export const metadata: Metadata = { title: "Servis şablonları" };

export default function TemplatesPage() {
  return <TemplateManager />;
}
