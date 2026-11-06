"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Göz simgeli şifre alanı (K-092): şifre yalnızca göz simgesine basılı tutulurken görünür,
 * parmak kalkınca yeniden gizlenir. Açık kalıp unutulmaz (güvenlik).
 */
export function PasswordInput({ ref, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  const show = () => setVisible(true);
  const hide = () => setVisible(false);
  return (
    <div className="password-field">
      <input ref={ref} {...props} type={visible ? "text" : "password"} className="form-input" />
      <button
        type="button"
        className="icon-btn password-peek"
        aria-label="Şifreyi görmek için basılı tutun"
        onPointerDown={(e) => {
          e.preventDefault(); // alan odağını kaybetmesin, klavye kapanmasın
          show();
        }}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") show();
        }}
        onKeyUp={hide}
        onBlur={hide}
        onContextMenu={(e) => e.preventDefault()}
      >
        {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
