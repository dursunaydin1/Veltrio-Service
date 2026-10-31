import type { Metadata } from "next";
import { ProductForm } from "@/components/products/ProductForm";

export const metadata: Metadata = { title: "Yeni ürün" };

export default function NewProductPage() {
  return (
    <section className="stack stack-md">
      <h1>Ürün ekle</h1>
      <ProductForm />
    </section>
  );
}
