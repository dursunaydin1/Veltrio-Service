/**
 * Görünüm teması (K-043): koyu (varsayılan), açık veya cihaz ayarını izle.
 * Seçim yalnızca bu cihaz için tarayıcıda tutulur; işletme verisi değildir.
 */
export type ThemePreference = "dark" | "light" | "system";

export const THEME_KEY = "veltrio_theme";
export const THEME_COLORS = { dark: "#0f0f11", light: "#f4f4f6" } as const;

export function resolveTheme(pref: ThemePreference, prefersLight: boolean): "dark" | "light" {
  if (pref === "system") return prefersLight ? "light" : "dark";
  return pref;
}

export function readThemePreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "system" || v === "dark" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(pref: ThemePreference) {
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = resolveTheme(pref, prefersLight);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

export function saveThemePreference(pref: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Depolama kapalıysa seçim yalnızca bu oturumda geçerli olur.
  }
  applyTheme(pref);
}

/**
 * Sayfa boyanmadan önce çalışan küçük betik (koyu/açık arasında yanıp sönmeyi önler).
 * `<head>` içine satır içi olarak konur.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,t="dark";try{var v=localStorage.getItem("${THEME_KEY}");if(v==="light"||v==="dark")t=v;else if(v==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}catch(e){}d.dataset.theme=t})();`;
