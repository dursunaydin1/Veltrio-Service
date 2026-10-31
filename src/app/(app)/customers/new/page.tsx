import type { Metadata } from "next";
import { CustomerForm } from "@/components/customers/CustomerForm";

export const metadata: Metadata = { title: "Yeni müşteri" };

export default function NewCustomerPage() {
  return (
    <section className="stack stack-md">
      <h1>Müşteri ekle</h1>
      <CustomerForm />
    </section>
  );
}
