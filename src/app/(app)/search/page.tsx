import type { Metadata } from "next";
import { GlobalSearch } from "@/components/search/GlobalSearch";

export const metadata: Metadata = { title: "Ara" };

export default function SearchPage() {
  return <GlobalSearch />;
}
