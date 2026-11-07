"use client";

import { useEffect, useState } from "react";
import { THEME_LABELS, applyTheme, readTheme, type ThemeChoice } from "@/lib/ui/theme";

const CHOICES = Object.keys(THEME_LABELS) as ThemeChoice[];

/** Ayarlar → Görünüm (K-116): koyu / açık / telefonun ayarı; seçince hemen uygulanır. */
export function ThemeSettings() {
  const [choice, setChoice] = useState<ThemeChoice>("dark");

  // Kayıtlı seçim yalnızca tarayıcıda okunabilir: ilk çizimden sonra bir kez
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(readTheme());
  }, []);

  return (
    <section className="card stack stack-md" aria-labelledby="theme-title">
      <h2 id="theme-title">Tema</h2>
      <div className="chip-group" role="radiogroup" aria-labelledby="theme-title">
        {CHOICES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={choice === c}
            className="chip chip-toggle"
            onClick={() => {
              setChoice(c);
              applyTheme(c);
            }}
          >
            {THEME_LABELS[c]}
          </button>
        ))}
      </div>
      <small className="muted">
        Açık tema gün ışığında ve aydınlık dükkânda daha rahat okunur. Seçim yalnızca bu cihazda geçerlidir; servis fişi her
        temada beyaz kâğıt olarak basılır.
      </small>
    </section>
  );
}
