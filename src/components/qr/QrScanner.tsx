"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ScanBarcode } from "lucide-react";
import { parseScan } from "@/lib/qr/payload";
import { PageHead } from "@/components/layout/PageHead";
import { useAppNav } from "@/lib/nav/useAppNav";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { CodeScanner } from "@/components/qr/CodeScanner";
import { ProductPicker } from "@/components/products/ProductPicker";
import { findProductByBarcode, normalizeBarcode, setProductBarcode } from "@/lib/products/service";
import { errorMessage } from "@/lib/errors/message";

/**
 * QR / barkod tarama (Adım 3.4, AC-003, K-102). Makine veya ürün QR etiketi ilgili ekranı açar;
 * kutudaki fabrika barkodu, o barkod tanıtılmış ürünü açar. Tanınmayan barkod için iki yol:
 * yeni ürün olarak ekle ya da mevcut bir ürüne bağla. Oturum yoksa proxy girişe yönlendirir.
 */
export function QrScanner() {
  // Kaydedince form geçmişten çıkar; geri hareketi formu yeniden açmaz (K-076)
  const nav = useAppNav();
  const ctx = useBusinessContext();
  const handled = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  /** Hiçbir ürüne tanıtılmamış barkod */
  const [unknown, setUnknown] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  async function open(text: string) {
    if (handled.current || unknown) return;
    setError(null);
    const qr = parseScan(text);
    if (qr.ok) {
      handled.current = true;
      return nav.replace(qr.path);
    }
    // QR değilse fabrika barkodu olarak ürünlerde aranır
    const barcode = normalizeBarcode(text);
    if (!ctx || !barcode || /^https?:/i.test(barcode)) return setError(qr.reason);
    const product = await findProductByBarcode(ctx.businessId, barcode);
    if (product) {
      handled.current = true;
      return nav.replace(`/products/${product.id}`);
    }
    setUnknown(barcode);
  }

  async function link(productId: string) {
    if (!ctx || !unknown) return;
    setError(null);
    try {
      await setProductBarcode(ctx, productId, unknown);
      handled.current = true;
      nav.replace(`/products/${productId}`);
    } catch (e) {
      setError(errorMessage(e, "Barkod kaydedilemedi."));
    }
  }

  return (
    <section className="stack stack-md">
      <PageHead title="QR / Barkod Tara" />

      {unknown ? (
        <div className="card stack stack-md">
          <span className="avatar" data-tone="warn" aria-hidden="true"><ScanBarcode size={22} /></span>
          <strong>Bu barkod kayıtlı değil</strong>
          <p>
            Okunan barkod: <b className="mono">{unknown}</b>
            <br />
            Ürün stokta varsa ona bağlayın; bir dahaki okutmada doğrudan açılır.
          </p>
          {linking ? (
            <ProductPicker value="" onChange={(p) => void link(p.id)} label="Hangi ürüne bağlansın?" includeSerial />
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-full" onClick={() => setLinking(true)}>Mevcut ürüne bağla</button>
              <Link href={`/products/new?barcode=${encodeURIComponent(unknown)}`} className="btn btn-secondary btn-full">Yeni ürün olarak ekle</Link>
            </>
          )}
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <button type="button" className="btn btn-ghost btn-full" onClick={() => { setUnknown(null); setLinking(false); setError(null); }}>
            Tekrar okut
          </button>
        </div>
      ) : (
        <>
          <CodeScanner onCode={(text) => void open(text)} />
          {error ? <div className="alert alert-warning" role="alert">{error}</div> : null}
          <form
            className="stack stack-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void open(manual);
            }}
          >
            <label className="form-label" htmlFor="qr-manual">QR adresi ya da barkod numarasını elle gir</label>
            <input id="qr-manual" className="form-input" placeholder="https://…/machines/… ya da 8690…" value={manual} onChange={(e) => setManual(e.target.value)} />
            <button type="submit" className="btn btn-secondary" disabled={!manual.trim()}>Aç</button>
          </form>
        </>
      )}
    </section>
  );
}
