import type { Metadata } from "next";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Yeni tedarikçi" };

export default async function NewSupplierPage({ searchParams }: { searchParams: Promise<{ name?: string; phone?: string }> }) {
  // Aramada bulunamayan kayıt için ad / telefon dolu gelir (K-087)
  const initial = await searchParams;
  return (
    <section className="stack stack-md">
      <PageHead title="Tedarikçi ekle" />
      <SupplierForm initial={initial} />
    </section>
  );
}
