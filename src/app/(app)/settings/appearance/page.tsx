import type { Metadata } from "next";
import { PageHead } from "@/components/layout/PageHead";
import { ThemeSettings } from "@/components/settings/ThemeSettings";

export const metadata: Metadata = { title: "Görünüm" };

export default function AppearancePage() {
  return (
    <section className="stack stack-md">
      <PageHead title="Görünüm" />
      <ThemeSettings />
    </section>
  );
}
