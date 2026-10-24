import type { Metadata } from "next";
import { DataCheck } from "@/components/settings/DataCheck";

export const metadata: Metadata = { title: "Veri denetimi" };

export default function DataCheckPage() {
  return <DataCheck />;
}
