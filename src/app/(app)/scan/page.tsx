import type { Metadata } from "next";
import { QrScanner } from "@/components/qr/QrScanner";

export const metadata: Metadata = { title: "QR Tara" };

export default function ScanPage() {
  return <QrScanner />;
}
