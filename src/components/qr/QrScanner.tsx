"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cameraErrorMessage } from "@/lib/qr/camera";
import { parseScan } from "@/lib/qr/payload";
import { reportError } from "@/lib/errors/report";
import { PageHead } from "@/components/layout/PageHead";

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
  const [cameraFailed, setCameraFailed] = useState(false);
  // "Tekrar dene" kamerayı yeniden başlatır
  const [attempt, setAttempt] = useState(0);
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
      } catch (e) {
        if (!cancelled) {
          setStarting(false);
          setCameraFailed(true);
          setError(cameraErrorMessage(e));
          // Gerçek nedeni görebilmek için hata kaydına da yazılır (client_errors)
          void reportError(e instanceof Error ? e : new Error(`QR kamera: ${String(e)}`));
        }
      }
    })();

    return () => {
      cancelled = true;
      void stop?.();
    };
    // open yalnızca router'a dayanır; tarayıcı her denemede bir kez başlatılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  function retry() {
    setError(null);
    setCameraFailed(false);
    setStarting(true);
    setAttempt((n) => n + 1);
  }

  return (
    <section className="stack stack-md">
      <PageHead title="QR Tara" />
      <div
        id={REGION_ID}
        style={{ width: "100%", maxWidth: 360, margin: "0 auto", minHeight: cameraFailed ? 0 : 240 }}
        aria-label="Kamera görüntüsü"
        hidden={cameraFailed}
      />
      {starting ? <p>Kamera hazırlanıyor…</p> : null}
      {error ? <div className="alert alert-warning" role="alert">{error}</div> : null}
      {cameraFailed ? (
        <button type="button" className="btn btn-primary" onClick={retry}>Tekrar dene</button>
      ) : null}
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
