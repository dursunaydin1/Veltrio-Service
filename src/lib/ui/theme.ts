/**
 * Görünüm teması (K-116). Seçim bu cihaza özeldir (localStorage); hesapla eşitlenmez,
 * çünkü aynı kişi telefonda açık, bilgisayarda koyu isteyebilir. Varsayılan koyudur.
 * <html data-theme="…"> özniteliği renk değişkenlerini değiştirir (globals.css).
 */
export type ThemeChoice = "dark" | "light" | "system";

export const THEME_KEY = "veltrio_theme";
export const THEME_LABELS: Record<ThemeChoice, string> = {
  dark: "Koyu",
  light: "Açık",
  system: "Telefonun ayarı",
};

/** Tarayıcı / adres çubuğu rengi: zemin rengiyle aynı */
const THEME_COLOR = { dark: "#0b1120", light: "#f3f0e9" } as const;

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "dark" || value === "light" || value === "system";
}

export function readTheme(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return isThemeChoice(saved) ? saved : "dark";
  } catch {
    return "dark";
  }
}

/** Seçimi uygular ve hatırlar. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  root.dataset.theme = choice;
  const effective = choice === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : choice;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[effective]);
  try {
    window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Depolama kapalıysa seçim yalnızca bu oturumda geçerli
  }
}

/**
 * Sayfa çizilmeden önce çalışan küçük betik (layout <head>): kayıtlı tema ilk karede uygulanır,
 * açılışta koyu → açık "yanıp sönme" olmaz. React'ten bağımsız, düz JavaScript.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="system"){document.documentElement.dataset.theme=t;var l=t==="light"||matchMedia("(prefers-color-scheme: light)").matches;var m=document.querySelector('meta[name="theme-color"]');if(m&&l)m.setAttribute("content",${JSON.stringify(THEME_COLOR.light)});}}catch(e){}})();`;
