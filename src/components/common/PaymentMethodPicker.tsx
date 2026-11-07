"use client";

import { PAYMENT_METHOD_LABELS } from "@/lib/finance/service";
import type { PaymentMethod } from "@/types";

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

/**
 * Ödeme / iade yöntemi (K-110): açılır liste yerine tek dokunuşla seçilen çipler; her ekranda aynı.
 * `extra`: yöntemlerden önce gelen ek seçenekler (ör. iade ekranında "Müşteri alacağına yaz").
 */
export function PaymentMethodPicker<T extends string = PaymentMethod>({
  value,
  onChange,
  label = "Ödeme yöntemi",
  extra = [],
}: {
  value: T;
  onChange: (method: T) => void;
  label?: string;
  extra?: readonly { value: T; label: string }[];
}) {
  const options = [...extra, ...METHODS.map((m) => ({ value: m as unknown as T, label: PAYMENT_METHOD_LABELS[m] }))];
  return (
    <fieldset className="choice-field">
      <legend className="form-label">{label}</legend>
      <div className="chip-group">
        {options.map((o) => (
          <button key={o.value} type="button" className="chip chip-toggle" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
