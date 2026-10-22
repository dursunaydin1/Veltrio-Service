import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: "Servisler" };

export default function Page() {
  return <ComingSoon title="Servisler" phase="FAZ 3" />;
}
