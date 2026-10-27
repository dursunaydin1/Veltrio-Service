"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, readThemePreference, saveThemePreference, type ThemePreference } from "@/lib/theme";

const OPTIONS: { id: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { id: "dark", label: "Koyu", Icon: Moon },
  { id: "light", label: "Açık", Icon: Sun },
  { id: "system", label: "Cihaz", Icon: Monitor },
];

/** Görünüm seçimi (Menü sayfası). Güneş altında açık tema daha okunaklıdır. */
export function ThemeSwitcher() {
  const [pref, setPref] = useState<ThemePreference>("dark");

  useEffect(() => {
    const current = readThemePreference();
    setPref(current); // eslint-disable-line react-hooks/set-state-in-effect
    if (current !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  return (
    <div className="stack stack-sm">
      <span className="form-label">Görünüm</span>
      <div className="theme-switch" role="tablist" aria-label="Görünüm">
        {OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pref === id}
            className="btn"
            onClick={() => {
              saveThemePreference(id);
              setPref(id);
            }}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
