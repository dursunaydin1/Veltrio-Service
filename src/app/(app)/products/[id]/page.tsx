import type { Metadata } from "next";
import { ProductEditor } from "@/components/products/ProductEditor";

export const metadata: Metadata = { title: "Ürün" };

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductEditor id={id} />;
}
