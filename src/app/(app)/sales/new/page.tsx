import type { Metadata } from "next";
import { SaleForm } from "@/components/sales/SaleForm";

export const metadata: Metadata = { title: "Yeni satış" };

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  return (
    <section className="stack stack-md">
      <h1>Satış yap</h1>
      <SaleForm initialCustomerId={customer} />
    </section>
  );
}
