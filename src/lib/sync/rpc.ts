/**
 * Veritabanında fonksiyon yok mu? (migration henüz uygulanmamış). PostgREST "PGRST202",
 * Postgres "42883" döndürür. Yeni fonksiyona geçişte eski yola düşmek için kullanılır.
 */
export function isMissingFunction(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}
