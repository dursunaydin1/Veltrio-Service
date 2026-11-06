/** Kısa titreşim (dokunma geri bildirimi); desteklemeyen cihazda sessizce geçer. */
export function haptic(): void {
  try {
    navigator.vibrate?.(8);
  } catch {
    // desteklenmiyor
  }
}
