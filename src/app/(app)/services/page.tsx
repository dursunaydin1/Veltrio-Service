import type { Metadata } from "next";
import { ServiceList } from "@/components/services/ServiceList";

export const metadata: Metadata = { title: "Servisler" };

export default function ServicesPage() {
  return <ServiceList />;
}
