import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: "Stok" };

export default function Page() {
  return <ComingSoon title="Stok" phase="FAZ 2" />;
}
