import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: "Satışlar" };

export default function Page() {
  return <ComingSoon title="Satışlar" phase="FAZ 4" />;
}
