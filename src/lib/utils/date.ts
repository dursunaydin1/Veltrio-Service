/**
 * Tarih yardımcı araçları.
 * PRD §3: Tüm tarihler UTC olarak saklanır, gösterim Türkiye yerel saatiyle.
 */

const TR_DATE_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});

const TR_DATETIME_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});

const TR_TIME_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});

/**
 * UTC ISO string'i Türkiye tarihine formatlar.
 * Örnek: "2025-06-15T10:30:00Z" → "15.06.2025"
 */
export function formatDate(isoString: string | Date): string {
  const date = typeof isoString === "string" ? new Date(isoString) : isoString;
  return TR_DATE_FORMATTER.format(date);
}

/**
 * UTC ISO string'i Türkiye tarih+saatine formatlar.
 * Örnek: "2025-06-15T10:30:00Z" → "15.06.2025 13:30"
 */
export function formatDateTime(isoString: string | Date): string {
  const date = typeof isoString === "string" ? new Date(isoString) : isoString;
  return TR_DATETIME_FORMATTER.format(date);
}

/**
 * Sadece saat gösterimi.
 */
export function formatTime(isoString: string | Date): string {
  const date = typeof isoString === "string" ? new Date(isoString) : isoString;
  return TR_TIME_FORMATTER.format(date);
}

/**
 * Şimdiki anı UTC ISO string olarak döner.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Türkiye yerel tarihini YYYY-MM-DD formatında döner.
 * Filtreler ve raporlar için kullanılır.
 */
export function todayLocalDate(): string {
  const now = new Date();
  const trDate = new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Istanbul",
  }).formatToParts(now);

  const parts = Object.fromEntries(trDate.map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Europe/Istanbul takvimine göre yıl (belge numaralarında kullanılır).
 */
export function istanbulYear(date: Date = new Date()): number {
  const year = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(date);
  return Number(year);
}

/**
 * İki tarih arasındaki gün farkını hesaplar.
 * Pozitif → date2, date1'den sonra
 */
export function daysBetween(date1: string | Date, date2: string | Date): number {
  const d1 = typeof date1 === "string" ? new Date(date1) : date1;
  const d2 = typeof date2 === "string" ? new Date(date2) : date2;
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Vade yaşlandırma bandını hesaplar.
 * PRD §15: 0-7, 8-30, 31-60, 60+ gün
 */
export function getAgingBand(
  dueDateISO: string
): "0-7" | "8-30" | "31-60" | "60+" {
  const days = daysBetween(dueDateISO, new Date());
  if (days <= 7) return "0-7";
  if (days <= 30) return "8-30";
  if (days <= 60) return "31-60";
  return "60+";
}
