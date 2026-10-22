import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: "Satın Almalar" };

export default function Page() {
  return <ComingSoon title="Satın Almalar" phase="FAZ 4" />;
}
