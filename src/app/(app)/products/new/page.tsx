import type { Metadata } from "next";
import { ProductForm } from "@/components/products/ProductForm";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Yeni ürün" };

export default function NewProductPage() {
  return (
    <section className="stack stack-md">
      <PageHead title="Ürün ekle" />
      <ProductForm />
    </section>
  );
}
