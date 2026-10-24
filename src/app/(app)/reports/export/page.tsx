import type { Metadata } from "next";
import { ExportHub } from "@/components/reports/ExportHub";

export const metadata: Metadata = { title: "Dışa aktar" };

export default function Page() {
  return <ExportHub />;
}
