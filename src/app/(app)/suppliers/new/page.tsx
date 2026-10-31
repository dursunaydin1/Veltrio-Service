import type { Metadata } from "next";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Yeni tedarikçi" };

export default function NewSupplierPage() {
  return (
    <section className="stack stack-md">
      <PageHead title="Tedarikçi ekle" />
      <SupplierForm />
    </section>
  );
}
