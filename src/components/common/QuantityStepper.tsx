"use client";

import { Minus, Plus } from "lucide-react";
import { parseQuantityInput } from "@/lib/calc";

/** Miktarı `delta` kadar değiştirir, `min`in altına inmez. Boş ya da geçersiz miktar `min` olur. */
export function stepQuantity(value: string, delta: number, min = 1): string {
  const current = parseQuantityInput(value);
  if (current === null) return String(min);
  const next = Math.max(min, Math.round((current + delta) * 1000) / 1000);
  return String(next).replace(".", ",");
}

/**
 * Miktar alanı (K-097, K-098): ortada yazılabilir kutu, yanlarda − / + düğmeleri.
 * Çoğu miktar tam sayıdır; düğmeler bir artırır, kesirli miktar (1,5 m) kutuya yazılır.
 */
export function QuantityStepper({
  id,
  value,
  onChange,
  min = 1,
  label = "Miktar",
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  /** Ekran okuyucu için alan adı */
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <span className="qty-stepper">
      <button type="button" className="icon-btn" aria-label={`${label}: azalt`} onClick={() => onChange(stepQuantity(value, -1, min))}>
        <Minus size={18} aria-hidden="true" />
      </button>
      <input
        id={id}
        className="form-input"
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
      <button type="button" className="icon-btn" aria-label={`${label}: artır`} onClick={() => onChange(stepQuantity(value, 1, min))}>
        <Plus size={18} aria-hidden="true" />
      </button>
    </span>
  );
}
