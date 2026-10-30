import type { Metadata } from "next";
import { ErrorScreen } from "@/components/layout/ErrorScreen";

export const metadata: Metadata = { title: "Sayfa bulunamadı" };

/** Bilinmeyen adres (K-053): Next.js'in İngilizce varsayılan ekranı yerine. */
export default function NotFound() {
  return (
    <ErrorScreen
      title="Sayfa bulunamadı"
      text="Aradığınız sayfa taşınmış ya da silinmiş olabilir. Kayıt silindiyse listeden tekrar arayabilirsiniz."
    />
  );
}
