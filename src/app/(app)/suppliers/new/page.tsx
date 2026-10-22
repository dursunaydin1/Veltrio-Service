import type { Metadata } from "next";
import { SupplierForm } from "@/components/suppliers/SupplierForm";

export const metadata: Metadata = { title: "Yeni tedarikçi" };

export default function NewSupplierPage() {
  return (
    <section className="stack stack-md">
      <h1>Yeni tedarikçi</h1>
      <SupplierForm />
    </section>
  );
}
