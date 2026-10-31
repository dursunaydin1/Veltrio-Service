import type { Metadata } from "next";
import { PurchaseForm } from "@/components/purchases/PurchaseForm";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Yeni alım" };

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { supplier } = await searchParams;
  return (
    <section className="stack stack-md">
      <PageHead title="Satın alma" />
      <PurchaseForm initialSupplierId={supplier} />
    </section>
  );
}
