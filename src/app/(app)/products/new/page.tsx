import type { Metadata } from "next";
import { ProductForm } from "@/components/products/ProductForm";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Yeni ürün" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  // Aramada bulunamayan kayıt için ad / telefon dolu gelir (K-087)
  const initial = await searchParams;
  return (
    <section className="stack stack-md">
      <PageHead title="Ürün ekle" />
      <ProductForm initial={initial} />
    </section>
  );
}
