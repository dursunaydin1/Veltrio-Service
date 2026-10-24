"use client";

import { useState } from "react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { findStockMismatches, repairStockMismatches, type StockMismatch } from "@/lib/stock/integrity";
import { formatQuantity } from "@/lib/utils";

/**
 * Veri denetimi (ST-013, TC-054): stok özetini hareket defteriyle karşılaştırır;
 * fark varsa defteri esas alıp düzeltir ve audit log'a yazar.
 */
export function DataCheck() {
  const ctx = useBusinessContext();
  const [result, setResult] = useState<{ found: StockMismatch[]; fixed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fix: boolean) {
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    setError(null);
    try {
      const found = fix ? await repairStockMismatches(ctx) : await findStockMismatches(ctx.businessId);
      setResult({ found, fixed: fix });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Denetim yapılamadı.");
    }
    setBusy(false);
  }

  return (
    <section className="stack stack-md">
      <h1>Veri denetimi</h1>
      <p>
        Ürünlerin stok özeti, stok hareket defterinden yeniden hesaplanıp karşılaştırılır. Fark bulunursa hareketler esas
        alınır; hareketler hiçbir zaman değiştirilmez.
      </p>
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => void run(false)} disabled={busy}>
          Denetle
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => void run(true)} disabled={busy}>
          Denetle ve düzelt
        </button>
      </div>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {result ? (
        result.found.length === 0 ? (
          <div className="alert alert-success" role="status">Stok özetleri hareket defteriyle tutarlı.</div>
        ) : (
          <>
            <div className="alert alert-warning" role="status">
              {result.found.length} üründe fark {result.fixed ? "bulundu ve düzeltildi (audit log'a yazıldı)." : "bulundu."}
            </div>
            <ul className="menu-list" aria-label="Farklar">
              {result.found.map((m) => (
                <li key={m.productId} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
                  <strong>{m.name}</strong>
                  <small style={{ color: "var(--text-muted)" }}>
                    Özet: {formatQuantity(m.cachedAvailable)} / hasarlı {formatQuantity(m.cachedDamaged)} · Defter:{" "}
                    {formatQuantity(m.ledgerAvailable)} / hasarlı {formatQuantity(m.ledgerDamaged)}
                  </small>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </section>
  );
}
