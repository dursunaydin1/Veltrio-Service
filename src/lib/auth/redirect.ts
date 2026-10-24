/**
 * Girişten sonra dönülecek yol. Açık yönlendirme (open redirect) olmaması için
 * yalnızca uygulama içi, tek eğik çizgiyle başlayan yollar kabul edilir.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/auth")) return fallback;
  return next;
}
