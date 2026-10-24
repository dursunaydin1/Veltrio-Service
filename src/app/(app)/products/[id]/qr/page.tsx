import type { Metadata } from "next";
import { ProductQr } from "@/components/qr/ProductQr";

export const metadata: Metadata = { title: "QR etiketi" };

export default async function ProductQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductQr id={id} />;
}
