"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseScan } from "@/lib/qr/payload";

const REGION_ID = "qr-reader";

/**
 * QR tarama (Adım 3.4, AC-003): kamera ile makine / ürün etiketini okur ve ilgili
 * ekrana gider. Oturum yoksa proxy girişe yönlendirir ve girişten sonra aynı
 * sayfaya geri döner. Kamera açılamazsa adres elle yapıştırılabilir.
 */
export function QrScanner() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [starting, setStarting] = useState(true);
  const handled = useRef(false);

  function open(text: string) {
    if (handled.current) return;
    const result = parseScan(text);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    handled.current = true;
    router.push(result.path);
  }

  useEffect(() => {
    let stop: (() => Promise<void>) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(REGION_ID);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => open(text),
          () => undefined
        );
        stop = async () => {
          try {
            await scanner.stop();
            scanner.clear();
          } catch {
            // Tarayıcı zaten durmuş olabilir.
          }
        };
        if (cancelled) await stop();
        else setStarting(false);
      } catch {
        if (!cancelled) {
          setStarting(false);
          setError("Kamera açılamadı. Tarayıcıda kamera iznini kontrol edin veya QR adresini aşağıya yapıştırın.");
        }
      }
    })();

    return () => {
      cancelled = true;
      void stop?.();
    };
    // open yalnızca router'a dayanır; tarayıcı bir kez başlatılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="stack stack-md">
      <h1>QR Tara</h1>
      <div id={REGION_ID} style={{ width: "100%", maxWidth: 360, margin: "0 auto", minHeight: 240 }} aria-label="Kamera görüntüsü" />
      {starting ? <p>Kamera hazırlanıyor…</p> : null}
      {error ? <div className="alert alert-warning" role="alert">{error}</div> : null}
      <form
        className="stack stack-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          open(manual);
        }}
      >
        <label className="form-label" htmlFor="qr-manual">QR adresini elle gir</label>
        <input id="qr-manual" className="form-input" placeholder="https://…/machines/…" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button type="submit" className="btn btn-secondary" disabled={!manual.trim()}>Aç</button>
      </form>
    </section>
  );
}
