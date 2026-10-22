import type { Metadata } from "next";
import { PurchaseForm } from "@/components/purchases/PurchaseForm";

export const metadata: Metadata = { title: "Yeni alım" };

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { supplier } = await searchParams;
  return (
    <section className="stack stack-md">
      <h1>Yeni alım</h1>
      <PurchaseForm initialSupplierId={supplier} />
    </section>
  );
}
