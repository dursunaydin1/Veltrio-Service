import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/layout/Logo";

/** Hata ve "bulunamadı" ekranları için ortak, markalı düzen (K-053). */
export function ErrorScreen({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <main className="error-screen">
      <LogoMark size={56} />
      <h1>{title}</h1>
      <p>{text}</p>
      <div className="error-actions">
        {children}
        <Link href="/dashboard" className="btn btn-secondary">Ana sayfaya dön</Link>
      </div>
    </main>
  );
}
