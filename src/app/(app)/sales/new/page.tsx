import type { Metadata } from "next";
import { SaleForm } from "@/components/sales/SaleForm";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Yeni satış" };

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  return (
    <section className="stack stack-md">
      <PageHead title="Satış yap" />
      <SaleForm initialCustomerId={customer} />
    </section>
  );
}
