import type { Metadata } from "next";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Yeni müşteri" };

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ name?: string; phone?: string }> }) {
  // Aramada bulunamayan kayıt için ad / telefon dolu gelir (K-087)
  const initial = await searchParams;
  return (
    <section className="stack stack-md">
      <PageHead title="Müşteri ekle" />
      <CustomerForm initial={initial} />
    </section>
  );
}
