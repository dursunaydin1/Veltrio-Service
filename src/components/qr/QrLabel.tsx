"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, isLabelSizeId, qrUrl, type LabelSizeId, type QrKind } from "@/lib/qr/payload";
import { useSessionStore } from "@/stores/session";

const SIZE_KEY = "veltrio_label_size";
const SHOW_BUSINESS_KEY = "veltrio_label_business";

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Tarayıcı depolaması kapalıysa tercih hatırlanmaz; etiket yine basılabilir.
  }
}

/**
 * QR etiketi önizleme ve yazdırma (Adım 3.4). QR yalnızca kayıt adresini taşır;
 * altında kısa kimlik / ürün adı ve isteğe bağlı işletme adı yer alır. Boyut
 * seçilebilir ve hatırlanır.
 */
export function QrLabel({
  kind,
  id,
  title,
  subtitle,
}: {
  kind: QrKind;
  id: string;
  title: string;
  subtitle?: string;
}) {
  const businessName = useSessionStore((s) => s.business?.name);
  const [size, setSize] = useState<LabelSizeId>(DEFAULT_LABEL_SIZE);
  const [showBusiness, setShowBusiness] = useState(true);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tercihler yalnızca tarayıcıda okunabilir (sunucuda render edilirken yok): ilk çizimden sonra bir kez yüklenir.
  useEffect(() => {
    const saved = readPref(SIZE_KEY);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (isLabelSizeId(saved)) setSize(saved);
    setShowBusiness(readPref(SHOW_BUSINESS_KEY) !== "0");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrUrl(window.location.origin, kind, id), { margin: 1, width: 512, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setDataUrl(url))
      .catch(() => !cancelled && setError("QR oluşturulamadı."));
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  const dims = LABEL_SIZES[size];

  return (
    <div className="stack stack-md">
      <div className="no-print stack stack-sm">
        <div className="form-group">
          <label className="form-label" htmlFor="qr-size">Etiket boyutu</label>
          <select
            id="qr-size"
            className="form-input"
            value={size}
            onChange={(e) => {
              const next = e.target.value as LabelSizeId;
              setSize(next);
              writePref(SIZE_KEY, next);
            }}
          >
            {(Object.keys(LABEL_SIZES) as LabelSizeId[]).map((k) => (
              <option key={k} value={k}>{LABEL_SIZES[k].label}</option>
            ))}
          </select>
        </div>
        <label className="row row-gap-sm" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            checked={showBusiness}
            onChange={(e) => {
              setShowBusiness(e.target.checked);
              writePref(SHOW_BUSINESS_KEY, e.target.checked ? "1" : "0");
            }}
          />
          Etikette işletme adı yazılsın
        </label>
        <button type="button" className="btn btn-primary btn-full" onClick={() => window.print()} disabled={!dataUrl}>
          Yazdır
        </button>
        <small style={{ color: "var(--text-muted)" }}>
          QR yalnızca kayıt adresini içerir; fiyat ve stok değişse de etiketi yeniden basmanız gerekmez.
        </small>
      </div>

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      <div
        aria-label="Etiket önizleme"
        style={{
          width: `${dims.width}mm`,
          minHeight: `${dims.height}mm`,
          border: "1px dashed var(--border-default)",
          padding: "2mm",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1mm",
          background: "#fff",
          color: "#000",
          margin: "0 auto",
          fontSize: "2.8mm",
          lineHeight: 1.2,
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="QR kod" style={{ width: `${dims.qr}mm`, height: `${dims.qr}mm` }} />
        ) : (
          <div style={{ width: `${dims.qr}mm`, height: `${dims.qr}mm` }} />
        )}
        <strong style={{ wordBreak: "break-word" }}>{title}</strong>
        {subtitle ? <span style={{ wordBreak: "break-word" }}>{subtitle}</span> : null}
        {showBusiness && businessName ? <span style={{ fontSize: "2.4mm" }}>{businessName}</span> : null}
      </div>
    </div>
  );
}
