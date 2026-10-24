/**
 * Çevrimdışı azami süre (PRD §10, AC-045; BusinessSettings.max_offline_days):
 * cihaz son başarılı eşitlemeden bu yana belirlenen günden uzun süredir
 * eşitlenmemişse ve çevrimdışıysa **yeni kayıt** yazılamaz; internete bağlanıp
 * eşitlemek gerekir. Mevcut kayıtlar okunabilir.
 */

export const DEFAULT_MAX_OFFLINE_DAYS = 30;
const DAY_MS = 86_400_000;

export class OfflineLimitError extends Error {
  constructor(public readonly days: number) {
    super(
      `Bu cihaz ${days} gündür eşitlenmedi. Yeni kayıt için internete bağlanıp eşitleyin; eşitleme tamamlanınca devam edebilirsiniz.`
    );
    this.name = "OfflineLimitError";
  }
}

/** Son eşitlemeden geçen tam gün; hiç eşitlenmemişse null. */
export function daysSinceSync(lastSyncedAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!lastSyncedAt) return null;
  const t = Date.parse(lastSyncedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

export function offlineLimitExceeded(
  lastSyncedAt: string | null | undefined,
  maxDays: number = DEFAULT_MAX_OFFLINE_DAYS,
  now: Date = new Date()
): boolean {
  const days = daysSinceSync(lastSyncedAt, now);
  return days !== null && days > maxDays;
}

type Source = {
  getLastSyncedAt: () => string | null | undefined;
  getMaxDays: () => number | undefined;
  getIsOnline: () => boolean;
};

let source: Source | null = null;

/** Oturum durumunu kuran uygulama kodu çağırır; kurulmamışsa (ör. testler) sınır uygulanmaz. */
export function configureOfflineLimit(next: Source | null): void {
  source = next;
}

/** Yazma yolunda (kuyruğa ekleme) çağrılır: süre aşılmış ve çevrimdışıysa hata fırlatır. */
export function assertWriteAllowed(now: Date = new Date()): void {
  if (!source || source.getIsOnline()) return;
  const maxDays = source.getMaxDays() ?? DEFAULT_MAX_OFFLINE_DAYS;
  const last = source.getLastSyncedAt();
  if (offlineLimitExceeded(last, maxDays, now)) throw new OfflineLimitError(daysSinceSync(last, now) as number);
}
