"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errors/report";

/**
 * Kök düzende hata (K-053): uygulamanın kendisi açılamadığında. Kendi <html>/<body>'sini çizer;
 * globals.css yüklenmemiş olabileceği için biçim satır içidir.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    void reportError(error, error.digest);
  }, [error]);

  return (
    <html lang="tr">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#0b1120", color: "#eef2fb", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <main style={{ maxWidth: 360, display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Uygulama açılamadı</h1>
          <p style={{ margin: 0, color: "#b3bdd1", lineHeight: 1.5 }}>
            Beklenmeyen bir hata oldu. Kayıtlarınız cihazda güvende; hata bize iletildi.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 48, padding: "0 24px", border: 0, borderRadius: 12, background: "#c8a464", color: "#1a1408", fontSize: 16, fontWeight: 600 }}
          >
            Tekrar dene
          </button>
        </main>
      </body>
    </html>
  );
}
