"use client";

import { useState } from "react";
import { ScanBarcode } from "lucide-react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { CodeScanner } from "@/components/qr/CodeScanner";
import { confirmDialog } from "@/components/common/ConfirmDialog";
import { normalizeBarcode, setProductBarcode } from "@/lib/products/service";
import { parseScan } from "@/lib/qr/payload";
import type { Product } from "@/types";
import { NO_CONTEXT_MESSAGE, errorMessage } from "@/lib/errors/message";

/**
 * Ürün sayfasında fabrika barkodu (K-102): kutudaki barkod bir kez okutulup ürüne tanıtılır.
 * Sonra QR / Barkod Tara'da ya da satışta okutunca bu ürün bulunur. Elle de yazılabilir.
 */
export function ProductBarcodePanel({ product }: { product: Product }) {
  const ctx = useBusinessContext();
  const [mode, setMode] = useState<null | "scan" | "type">(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(raw: string | null) {
    if (!ctx) return setError(NO_CONTEXT_MESSAGE);
    setError(null);
    if (raw != null && parseScan(raw).ok) return setError("Bu bir Veltrio QR etiketi; ürünün kutusundaki çizgili barkodu okutun.");
    try {
      await setProductBarcode(ctx, product.id, raw);
      setMode(null);
      setTyped("");
      setSaved(raw != null);
    } catch (e) {
      setError(errorMessage(e, "Barkod kaydedilemedi."));
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: "Barkod kaldırılsın mı?",
      message: "Bu barkod okutulunca artık bu ürün açılmaz.",
      confirmLabel: "Kaldır",
      danger: true,
    });
    if (ok) await save(null);
  }

  return (
    <section className="card stack stack-sm" aria-labelledby="pb-title">
      <div className="row row-between">
        <h2 id="pb-title" style={{ fontSize: "1rem" }}>Barkod</h2>
        {product.barcode ? <span className="badge badge-green">Tanıtıldı</span> : null}
      </div>

      {mode === "scan" ? (
        <>
          <CodeScanner label="Kutudaki barkod" onCode={(text) => void save(text)} />
          <button type="button" className="btn btn-ghost btn-full" onClick={() => setMode(null)}>Vazgeç</button>
        </>
      ) : mode === "type" ? (
        <form
          className="stack stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (normalizeBarcode(typed)) void save(typed);
          }}
        >
          <input className="form-input" inputMode="numeric" placeholder="Barkod numarası (ör. 8690…)" aria-label="Barkod numarası" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary grow" onClick={() => setMode(null)}>Vazgeç</button>
            <button type="submit" className="btn btn-primary grow" disabled={!normalizeBarcode(typed)}>Kaydet</button>
          </div>
        </form>
      ) : product.barcode ? (
        <>
          <p className="mono" style={{ fontSize: "1.0625rem", fontWeight: 650 }}>{product.barcode}</p>
          {saved ? <div className="alert alert-success" role="status">Barkod kaydedildi. Artık okutunca bu ürün açılır.</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary grow" onClick={() => setMode("scan")}>Değiştir</button>
            <button type="button" className="btn btn-danger-soft grow" onClick={() => void remove()}>Kaldır</button>
          </div>
        </>
      ) : (
        <>
          <small className="muted">Kutusunda barkod varsa bir kez okutun; sonra okutunca ürün doğrudan açılır, satışta okutunca satışa eklenir. Etiket basmanız gerekmez.</small>
          <button type="button" className="btn btn-primary btn-full" onClick={() => setMode("scan")}>
            <ScanBarcode size={18} aria-hidden="true" /> Barkodu tanıt
          </button>
          <button type="button" className="btn btn-ghost btn-full" onClick={() => setMode("type")}>Numarayı elle yaz</button>
        </>
      )}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
    </section>
  );
}
