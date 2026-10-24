import type { Metadata } from "next";
import { CatalogManager } from "@/components/settings/CatalogManager";

export const metadata: Metadata = { title: "Kataloglar" };

export default function CatalogPage() {
  return <CatalogManager />;
}
