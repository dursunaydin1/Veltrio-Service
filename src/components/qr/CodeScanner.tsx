"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, CameraOff, ImageUp } from "lucide-react";
import { cameraErrorMessage, isPermissionDenied } from "@/lib/qr/camera";
import { reportError } from "@/lib/errors/report";

/**
 * checking: izin durumu soruluyor · ask: izin henüz istenmedi, önce ne için gerektiği anlatılır
 * denied: izin reddedilmiş, nereden açılacağı gösterilir · scanning: kamera açık · failed: başka bir kamera hatası
 */
type Phase = "checking" | "ask" | "denied" | "scanning" | "failed";

/** Aynı kod kamerada üst üste okunur; bu süre içinde ikinci kez bildirilmez */
const REPEAT_MS = 2000;

async function loadLibrary() {
  const mod = await import("html5-qrcode");
  const F = mod.Html5QrcodeSupportedFormats;
  // QR (kendi etiketlerimiz) + kutulardaki çizgili barkodlar (K-102)
  const formats = [F.QR_CODE, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF];
  const create = (id: string) =>
    new mod.Html5Qrcode(id, { verbose: false, formatsToSupport: formats, useBarCodeDetectorIfSupported: true });
  return { create };
}

/**
 * Kamera ile QR / barkod okuyucu (K-074, K-075, K-102). Okunan her metin `onCode`a verilir;
 * ne yapılacağına çağıran karar verir (ürüne git, satışa ekle, ürüne tanıt).
 * İzin yoksa "Fotoğraf çekerek okut": telefonun kamera uygulaması açılır, izin gerekmez.
 * Web uygulaması telefonun ayarlar ekranını açamadığı için reddedilmiş izinde yol adım adım gösterilir.
 */
export function CodeScanner({ onCode, label = "QR / barkod" }: { onCode: (text: string) => void; label?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const regionId = `code-reader-${uid}`;
  const fileRegionId = `code-file-${uid}`;
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  // Her "Kamerayı aç / Tekrar dene" kamerayı yeniden başlatır
  const [attempt, setAttempt] = useState(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const last = useRef<{ text: string; at: number } | null>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  function emit(text: string) {
    const now = Date.now();
    if (last.current && last.current.text === text && now - last.current.at < REPEAT_MS) return;
    last.current = { text, at: now };
    onCodeRef.current(text);
  }

  async function readPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const { create } = await loadLibrary();
      const text = await create(fileRegionId).scanFile(file, false);
      last.current = null;
      emit(text);
    } catch {
      setError("Fotoğrafta kod bulunamadı. Etikete / barkoda biraz yaklaşıp net ve ışıklı bir fotoğraf çekin.");
    } finally {
      setReading(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  const photoButton = (primary: boolean) => (
    <button
      type="button"
      className={`btn ${primary ? "btn-primary" : "btn-secondary"} btn-full ${reading ? "btn-loading" : ""}`}
      disabled={reading}
      onClick={() => photoInput.current?.click()}
    >
      {reading ? "Okunuyor…" : <><ImageUp size={18} aria-hidden="true" /> Fotoğraf çekerek okut</>}
    </button>
  );

  function startCamera() {
    setError(null);
    setPhase("scanning");
    setAttempt((n) => n + 1);
  }

  // İzin durumu: verilmişse doğrudan başla; reddedilmişse yol göster; ayarlardan dönünce izlenir
  useEffect(() => {
    let status: PermissionStatus | undefined;
    const apply = (state: PermissionState) => {
      if (state === "granted") {
        setPhase("scanning");
        setAttempt((n) => n + 1);
      } else if (state === "denied") setPhase("denied");
      else setPhase((p) => (p === "scanning" ? p : "ask"));
    };
    (async () => {
      try {
        status = await navigator.permissions.query({ name: "camera" as PermissionName });
        apply(status.state);
        status.onchange = () => status && apply(status.state);
      } catch {
        // İzin sorgusu desteklenmiyor (bazı iPhone sürümleri): önce açıklama, sonra tarayıcı sorar
        setPhase("ask");
      }
    })();
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  useEffect(() => {
    if (phase !== "scanning") return;
    let stop: (() => Promise<void>) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { create } = await loadLibrary();
        if (cancelled) return;
        const scanner = create(regionId);
        await scanner.start(
          { facingMode: "environment" },
          // Geniş çerçeve: çizgili barkod yatay uzun, QR kare; ikisi de sığar
          { fps: 10, qrbox: (w, h) => ({ width: Math.round(Math.min(w * 0.85, 320)), height: Math.round(Math.min(h * 0.6, 200)) }) },
          (text) => emit(text),
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
      } catch (e) {
        if (cancelled) return;
        if (isPermissionDenied(e)) {
          setPhase("denied");
          return;
        }
        setPhase("failed");
        setError(cameraErrorMessage(e));
        // Gerçek nedeni görebilmek için hata kaydına da yazılır (client_errors)
        void reportError(e instanceof Error ? e : new Error(`Kod okuyucu kamera: ${String(e)}`));
      }
    })();

    return () => {
      cancelled = true;
      void stop?.();
    };
    // emit yalnızca ref'lere dayanır; tarayıcı her denemede bir kez başlatılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, attempt]);

  return (
    <div className="stack stack-md">
      {phase === "scanning" ? (
        <>
          <div id={regionId} className="code-reader" aria-label="Kamera görüntüsü" />
          <small style={{ color: "var(--text-muted)", textAlign: "center" }}>{label} çerçevenin içine gelsin; okununca kendiliğinden algılanır.</small>
        </>
      ) : null}

      {phase === "ask" ? (
        <div className="card stack stack-md permission-card">
          <span className="avatar" data-tone="accent" aria-hidden="true"><Camera size={22} /></span>
          <strong>Kamera izni gerekiyor</strong>
          <p>Etiketteki QR kodunu ya da kutudaki barkodu okumak için kamerayı kullanırız. Görüntü kaydedilmez, telefondan dışarı gönderilmez.</p>
          <button type="button" className="btn btn-primary btn-full" onClick={startCamera}>Kamerayı aç</button>
          <small>Telefon izin isteyecek; “İzin ver”e dokunun. İzin vermek istemezseniz:</small>
          {photoButton(false)}
        </div>
      ) : null}

      {phase === "denied" ? (
        <div className="card stack stack-md permission-card" role="alert">
          <span className="avatar" data-tone="warn" aria-hidden="true"><CameraOff size={22} /></span>
          <strong>Canlı kamera izni kapalı</strong>
          <p>Sorun değil: telefonun kendi kamerasıyla etiketin ya da barkodun fotoğrafını çekin, kodu oradan okuyalım. İzin gerekmez.</p>
          {photoButton(true)}
          <details className="permission-more">
            <summary>Canlı tarama için izni açmak isterseniz</summary>
            <ol className="permission-steps">
              <li><b>Chrome</b>’u açın → sağ üstteki <b>⋮</b> → <b>Ayarlar</b> → <b>Site ayarları</b> → <b>Kamera</b></li>
              <li>Listede <b>veltrio-service.vercel.app</b>’e dokunun → <b>İzin ver</b></li>
              <li>Kamera hâlâ açılmazsa telefonun <b>Ayarlar → Uygulamalar → Chrome → Uygulama izinleri → Kamera</b> bölümünden de izin verin.</li>
              <li>Bu ekrana dönün; kamera kendiliğinden açılır.</li>
            </ol>
          </details>
          <button type="button" className="btn btn-ghost btn-full" onClick={startCamera}>İzni verdim, tekrar dene</button>
        </div>
      ) : null}

      {error ? <div className="alert alert-warning" role="alert">{error}</div> : null}
      {phase === "failed" ? (
        <>
          <button type="button" className="btn btn-primary" onClick={startCamera}>Tekrar dene</button>
          {photoButton(false)}
        </>
      ) : null}

      {/* Telefonun kamera uygulamasını açar; tarayıcı kamera izni gerekmez */}
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void readPhoto(e.target.files?.[0])}
      />
      <div id={fileRegionId} hidden />
    </div>
  );
}
