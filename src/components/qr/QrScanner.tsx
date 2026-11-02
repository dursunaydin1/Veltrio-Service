"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ImageUp } from "lucide-react";
import { cameraErrorMessage, isPermissionDenied } from "@/lib/qr/camera";
import { parseScan } from "@/lib/qr/payload";
import { reportError } from "@/lib/errors/report";
import { PageHead } from "@/components/layout/PageHead";
import { useAppNav } from "@/lib/nav/useAppNav";

const REGION_ID = "qr-reader";
const FILE_REGION_ID = "qr-file";

/**
 * checking: izin durumu soruluyor · ask: izin henüz istenmedi, önce ne için gerektiği anlatılır
 * denied: izin reddedilmiş, nereden açılacağı gösterilir · scanning: kamera açık · failed: başka bir kamera hatası
 */
type Phase = "checking" | "ask" | "denied" | "scanning" | "failed";

/**
 * QR tarama (Adım 3.4, AC-003): kamera ile makine / ürün etiketini okur ve ilgili
 * ekrana gider. Oturum yoksa proxy girişe yönlendirir ve girişten sonra aynı
 * sayfaya geri döner. Kamera açılamazsa adres elle yapıştırılabilir.
 *
 * İzin akışı (K-074): web uygulaması telefonun ayarlar ekranını kendisi açamaz. Bu yüzden izin
 * istenmeden önce ne için gerektiği anlatılır; reddedilmişse nereden açılacağı adım adım gösterilir
 * ve kullanıcı izni verip döndüğünde kamera kendiliğinden başlar.
 * İzinle hiç uğraşmamak için "Fotoğraf çekerek okut" (K-075): telefonun kendi kamera uygulaması açılır,
 * çekilen fotoğraftaki QR çözülür. Bu yol tarayıcı kamera izni istemez.
 */
export function QrScanner() {
  // Kaydedince form geçmişten çıkar; geri hareketi formu yeniden açmaz (K-076)
  const nav = useAppNav();
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  // Her "Kamerayı aç / Tekrar dene" kamerayı yeniden başlatır
  const [attempt, setAttempt] = useState(0);
  const handled = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  function open(text: string) {
    if (handled.current) return;
    const result = parseScan(text);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    handled.current = true;
    nav.replace(result.path);
  }

  async function readPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const text = await new Html5Qrcode(FILE_REGION_ID).scanFile(file, false);
      open(text);
    } catch {
      setError("Fotoğrafta QR kod bulunamadı. Etikete biraz yaklaşıp net ve ışıklı bir fotoğraf çekin.");
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
      }
      else if (state === "denied") setPhase("denied");
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
      } catch (e) {
        if (cancelled) return;
        if (isPermissionDenied(e)) {
          setPhase("denied");
          return;
        }
        setPhase("failed");
        setError(cameraErrorMessage(e));
        // Gerçek nedeni görebilmek için hata kaydına da yazılır (client_errors)
        void reportError(e instanceof Error ? e : new Error(`QR kamera: ${String(e)}`));
      }
    })();

    return () => {
      cancelled = true;
      void stop?.();
    };
    // open yalnızca router'a dayanır; tarayıcı her denemede bir kez başlatılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, attempt]);

  return (
    <section className="stack stack-md">
      <PageHead title="QR Tara" />

      {phase === "scanning" ? (
        <div id={REGION_ID} style={{ width: "100%", maxWidth: 360, margin: "0 auto", minHeight: 240 }} aria-label="Kamera görüntüsü" />
      ) : null}

      {phase === "ask" ? (
        <div className="card stack stack-md permission-card">
          <span className="avatar" data-tone="accent" aria-hidden="true"><Camera size={22} /></span>
          <strong>Kamera izni gerekiyor</strong>
          <p>Makine ve ürün etiketlerindeki QR kodunu okumak için kamerayı kullanırız. Görüntü kaydedilmez, telefondan dışarı gönderilmez.</p>
          <button type="button" className="btn btn-primary btn-full" onClick={startCamera}>Kamerayı aç</button>
          <small>Telefon izin isteyecek; “İzin ver”e dokunun. İzin vermek istemezseniz:</small>
          {photoButton(false)}
        </div>
      ) : null}

      {phase === "denied" ? (
        <div className="card stack stack-md permission-card" role="alert">
          <span className="avatar" data-tone="warn" aria-hidden="true"><CameraOff size={22} /></span>
          <strong>Canlı kamera izni kapalı</strong>
          <p>Sorun değil: telefonun kendi kamerasıyla etiketin fotoğrafını çekin, kodu oradan okuyalım. İzin gerekmez.</p>
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
      <div id={FILE_REGION_ID} hidden />

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
