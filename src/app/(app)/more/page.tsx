import type { Metadata } from "next";
import { AppInfo } from "@/components/layout/AppInfo";
import { version } from "../../../../package.json";
import { PageHead } from "@/components/layout/PageHead";
import { MoreMenu } from "@/components/layout/MenuList";

export const metadata: Metadata = { title: "Menü" };

export default function MorePage() {
  return (
    <section className="stack stack-lg">
      <PageHead title="Menü" />
      <MoreMenu />
      <AppInfo version={version} />
    </section>
  );
}
