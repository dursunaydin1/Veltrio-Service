import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: "Müşteriler" };

export default function Page() {
  return <ComingSoon title="Müşteriler" phase="FAZ 3" />;
}
