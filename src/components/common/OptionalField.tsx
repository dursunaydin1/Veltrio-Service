"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

/**
 * İsteğe bağlı alan (K-083): kapalıyken kesik çizgili "+ …" çipi, dokununca alan açılır ve imleç içine gelir.
 * X ile kapatınca `onClear` değeri siler. Değeri olan alan (`filled`) açık gelir.
 * Birden çok alan `OptionalGroup` içinde yan yana çip olarak durur; açılan alan tam satır kaplar.
 */
export function OptionalField({
  label,
  chip,
  htmlFor,
  filled,
  onClear,
  children,
}: {
  label: string;
  /** Çipte görünecek kısa ad; verilmezse `label` */
  chip?: string;
  htmlFor?: string;
  filled?: boolean;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!filled);
  const opened = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  // Kullanıcı açtıysa imleç alana gelir (sayfa açılırken dolu gelen alanda değil)
  useEffect(() => {
    if (open && opened.current) box.current?.querySelector<HTMLElement>("input, textarea, select, button:not(.optional-close)")?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className="chip chip-add"
        onClick={() => {
          opened.current = true;
          setOpen(true);
        }}
      >
        <Plus size={16} aria-hidden="true" /> {chip ?? label}
      </button>
    );
  }
  return (
    <div ref={box} className="form-group extra-field">
      <div className="extra-head">
        {htmlFor ? (
          <label className="form-label" htmlFor={htmlFor}>{label}</label>
        ) : (
          <span className="form-label">{label}</span>
        )}
        <button
          type="button"
          className="icon-btn optional-close"
          aria-label={`${label}: kaldır`}
          onClick={() => {
            onClear?.();
            setOpen(false);
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  );
}

/** İsteğe bağlı alanları bir arada tutar: kapalı olanlar yan yana çip, açılan alan tam satır. */
export function OptionalGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="optional-group-wrap">
      {title ? <span className="form-label">{title}</span> : null}
      <div className="optional-group">{children}</div>
    </div>
  );
}
