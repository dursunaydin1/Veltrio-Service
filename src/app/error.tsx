"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/layout/ErrorScreen";
import { reportError } from "@/lib/errors/report";

/**
 * Sayfa içinde beklenmeyen hata (K-053). Hata sunucuya kaydedilir; kayıtlarınız cihazda durduğu için
 * "Tekrar dene" çoğu zaman yeterlidir.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    void reportError(error, error.digest);
  }, [error]);

  return (
    <ErrorScreen
      title="Bir şeyler ters gitti"
      text="Bu ekran açılırken beklenmeyen bir hata oldu. Kayıtlarınız güvende; hata bize iletildi. Tekrar deneyin, düzelmezse ana sayfaya dönün."
    >
      <button type="button" className="btn btn-primary" onClick={() => retry()}>
        Tekrar dene
      </button>
    </ErrorScreen>
  );
}
