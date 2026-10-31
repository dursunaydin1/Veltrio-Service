import type { Metadata } from "next";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Yeni müşteri" };

export default function NewCustomerPage() {
  return (
    <section className="stack stack-md">
      <PageHead title="Müşteri ekle" />
      <CustomerForm />
    </section>
  );
}
