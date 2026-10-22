import type { Metadata } from "next";
import { CustomerList } from "@/components/customers/CustomerList";

export const metadata: Metadata = { title: "Müşteriler" };

export default function CustomersPage() {
  return <CustomerList />;
}
