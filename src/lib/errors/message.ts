/** Oturum / cihaz bilgisi henüz yüklenmeden bir işlem denenirse gösterilen ileti (K-108). */
export const NO_CONTEXT_MESSAGE = "Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.";

/**
 * Yakalanan hatadan kullanıcıya gösterilecek ileti. İş kuralı hataları (`…RuleError`) Türkçe
 * ve anlaşılır iletiyle fırlatılır; beklenmeyen hatada verilen genel ileti gösterilir.
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
