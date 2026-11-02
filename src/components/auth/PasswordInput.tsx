"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Göz simgeli şifre alanı: yazılanı göster / gizle (telefonda yazım hatası kontrolü için). */
export function PasswordInput({ ref, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input ref={ref} {...props} type={visible ? "text" : "password"} className="form-input" />
      <button
        type="button"
        className="icon-btn"
        aria-label={visible ? "Şifreyi gizle" : "Şifreyi göster"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
