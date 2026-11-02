"use client";

import { useRef, useState } from "react";
import { Camera, Images } from "lucide-react";
import { resizeImageFile } from "@/lib/images/resize";

/**
 * İsteğe bağlı fotoğraf alanı (FR-028): "Fotoğraf çek" kamerayı, "Galeriden seç" telefonda kayıtlı
 * fotoğrafları açar (K-076);
 * seçilen görsel istemcide 1200 px'e küçültülür. Değer JPEG data URL'dir.
 */
export function PhotoField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value?: string;
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange(await resizeImageFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fotoğraf işlenemedi.");
    }
    setBusy(false);
    if (camera.current) camera.current.value = "";
    if (gallery.current) gallery.current.value = "";
  }

  return (
    <div className="form-group">
      <span className="form-label">{label}</span>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={label} style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, objectFit: "cover" }} />
      ) : null}
      <div className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || busy} onClick={() => camera.current?.click()}>
          <Camera size={18} aria-hidden="true" /> Fotoğraf çek
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || busy} onClick={() => gallery.current?.click()}>
          <Images size={18} aria-hidden="true" /> Galeriden seç
        </button>
        {value && !disabled ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(undefined)}>Kaldır</button>
        ) : null}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label={`${label}: fotoğraf çek`} onChange={(e) => void pick(e.target.files?.[0])} />
        <input ref={gallery} type="file" accept="image/*" hidden aria-label={`${label}: galeriden seç`} onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      {busy ? <small>Küçültülüyor…</small> : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
    </div>
  );
}
