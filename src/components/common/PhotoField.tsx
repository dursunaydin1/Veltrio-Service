"use client";

import { useRef, useState } from "react";
import { resizeImageFile } from "@/lib/images/resize";

/**
 * İsteğe bağlı fotoğraf alanı (FR-028): telefonda kamera veya galeri açılır,
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
  const input = useRef<HTMLInputElement>(null);
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
    if (input.current) input.current.value = "";
  }

  return (
    <div className="form-group">
      <span className="form-label">{label}</span>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={label} style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, objectFit: "cover" }} />
      ) : null}
      <div className="row row-gap-sm">
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          aria-label={label}
          disabled={disabled || busy}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        {value && !disabled ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(undefined)}>Kaldır</button>
        ) : null}
      </div>
      {busy ? <small>Küçültülüyor…</small> : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
    </div>
  );
}
