/**
 * PWA yardımcıları (Adım 7.1, NFR-008): kalıcı depolama izni, depolama durumu ve kurulum ipuçları.
 * Tarayıcı önbelleği temizlenirse yerel veri kaybolabilir; bu yüzden kritik veri yalnızca tarayıcıya
 * emanet edilmez (sunucuya eşitlenir, yedek alınır) ve risk kullanıcıya gösterilir.
 */

/** Uygulamanın çevrimdışı açılması için önceden indirilecek sayfalar. */
export const PRECACHE_PATHS = [
  "/dashboard", "/services", "/services/new", "/sales", "/sales/new", "/products", "/customers", "/customers/new",
  "/machines", "/suppliers", "/purchases", "/search", "/scan", "/more", "/notifications", "/reports", "/settings", "/help",
];

export type StorageHealth = {
  /** Tarayıcı verinin kalıcı olduğunu garanti ediyor mu? */
  persisted: boolean | null;
  /** Kullanılan / kota (bayt) */
  usage?: number;
  quota?: number;
  supported: boolean;
};

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function getStorageHealth(): Promise<StorageHealth> {
  if (typeof navigator === "undefined" || !navigator.storage) return { persisted: null, supported: false };
  let persisted: boolean | null = null;
  let usage: number | undefined;
  let quota: number | undefined;
  try {
    persisted = (await navigator.storage.persisted?.()) ?? null;
    const estimate = await navigator.storage.estimate?.();
    usage = estimate?.usage;
    quota = estimate?.quota;
  } catch {
    // Bazı tarayıcılar (özel pencere) bu bilgiyi vermez.
  }
  return { persisted, usage, quota, supported: true };
}

/** Kullanıcıya gösterilecek depolama uyarısı; sorun yoksa null. */
export function storageWarning(health: StorageHealth, pending: number): string | null {
  if (!health.supported) return "Bu tarayıcı yerel depolamayı desteklemiyor; çevrimdışı çalışma ve kayıtlar riskte.";
  if (health.quota && health.usage && health.usage / health.quota > 0.8) {
    return "Cihaz depolama alanı dolmak üzere; eski fotoğrafları azaltın veya yedek alıp yer açın.";
  }
  if (health.persisted === false) {
    return pending > 0
      ? "Tarayıcı, depolanan verileri gerektiğinde silebilir ve eşitlenmemiş kayıtlarınız var. Hemen eşitleyin; uygulamayı ana ekrana ekleyin."
      : "Tarayıcı, depolanan verileri gerektiğinde silebilir. Verileriniz sunucuda saklanır; yine de uygulamayı ana ekrana ekleyin ve düzenli yedek alın.";
  }
  return null;
}

export type InstallHint = "installed" | "prompt" | "ios" | "none";

export function installHint(env: { standalone: boolean; hasPrompt: boolean; userAgent: string }): InstallHint {
  if (env.standalone) return "installed";
  if (env.hasPrompt) return "prompt";
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return "ios";
  return "none";
}
