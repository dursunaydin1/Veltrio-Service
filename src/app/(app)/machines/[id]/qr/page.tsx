import type { Metadata } from "next";
import { MachineQr } from "@/components/qr/MachineQr";

export const metadata: Metadata = { title: "QR etiketi" };

export default async function MachineQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MachineQr id={id} />;
}
