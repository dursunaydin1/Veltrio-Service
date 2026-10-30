import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/stores/session";

/** Aynı hatanın kısa sürede tekrar tekrar yazılmasını önler. */
const recent = new Map<string, number>();
const DEDUPE_MS = 60_000;
const MAX_PER_SESSION = 20;
let sent = 0;

const cut = (s: string | undefined, n: number) => (s ? s.slice(0, n) : undefined);

/** Hata kaydında gönderilecek alanlar (test edilebilir, yan etkisiz). */
export function errorRecord(error: unknown, extra: { digest?: string; url?: string; userAgent?: string } = {}) {
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Bilinmeyen hata");
  return {
    message: cut(e.message || e.name || "Bilinmeyen hata", 2000)!,
    stack: cut(e.stack, 8000),
    digest: extra.digest ?? (e as Error & { digest?: string }).digest,
    url: cut(extra.url, 1000),
    user_agent: cut(extra.userAgent, 500),
  };
}

/**
 * Beklenmeyen bir hatayı sunucudaki `client_errors` tablosuna yazar (K-053).
 * Asla hata fırlatmaz: çevrimdışıysa, oturum yoksa veya Supabase yapılandırılmamışsa sessizce vazgeçer.
 */
export async function reportError(error: unknown, digest?: string): Promise<void> {
  try {
    if (typeof window === "undefined" || !navigator.onLine || sent >= MAX_PER_SESSION) return;
    const record = errorRecord(error, { digest, url: location.pathname, userAgent: navigator.userAgent });
    const key = record.message + (record.digest ?? "");
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - DEDUPE_MS) return;
    recent.set(key, now);
    sent++;

    const { business, device } = useSessionStore.getState();
    await createClient()
      .from("client_errors")
      .insert({ ...record, business_id: business?.id ?? null, device_code: device?.device_code ?? null });
  } catch {
    // Hata kaydı başarısız olursa uygulamayı etkilemez
  }
}
