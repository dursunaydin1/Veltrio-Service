import { v4 as uuidv4 } from "uuid";

/**
 * UUID v4 üretir.
 * PRD §3: Tüm birincil anahtarlar client tarafında UUID v4 olarak üretilir.
 */
export function generateId(): string {
  return uuidv4();
}

/** Belge numarası türleri ve önekleri (Adım 1.6). */
export const DOCUMENT_PREFIXES = {
  service: "S",
  sale: "SAT",
  purchase: "AL",
  return: "IAD",
  machine: "MK",
  serialUnit: "SB",
} as const;

export type DocumentKind = keyof typeof DOCUMENT_PREFIXES;

/** Yıl içermeyen (cihaz başına tek sayaçlı) türler. */
const UNYEARLY_KINDS: ReadonlySet<DocumentKind> = new Set(["machine", "serialUnit"]);

export function isYearlyKind(kind: DocumentKind): boolean {
  return !UNYEARLY_KINDS.has(kind);
}

/**
 * Belge numarasını biçimlendirir (saf fonksiyon, sayaç tutmaz).
 *   Yıllık:  S-DEMO-AB23-2026-00001
 *   Yılsız:  MK-DEMO-AB23-00001
 * Sayacı artırmak için `nextDocumentNo` (@/lib/numbering) kullanılır.
 */
export function formatDocumentNo(
  kind: DocumentKind,
  deviceCode: string,
  sequence: number,
  year: number
): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError("Sıra numarası 1 veya daha büyük tam sayı olmalı.");
  }
  const seq = String(sequence).padStart(5, "0");
  const prefix = DOCUMENT_PREFIXES[kind];
  return isYearlyKind(kind)
    ? `${prefix}-${deviceCode}-${year}-${seq}`
    : `${prefix}-${deviceCode}-${seq}`;
}

/**
 * Cihaz kodu doğrulaması.
 * PRD §4.4: 4 alfanümerik karakter, özel karakter yok.
 * Format: [işletme_kodu]-[4 karakter]
 */
export function validateDeviceCode(code: string): boolean {
  return /^[A-Z0-9]{2,6}-[A-Z0-9]{4}$/.test(code.toUpperCase());
}

/**
 * İşletme prefix'inden cihaz kodu üretir.
 * businessPrefix: 2-6 alfanümerik karakter
 * suffix: 4 rastgele alfanümerik karakter
 */
export function generateDeviceCode(businessPrefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Karışabilecek I/O/1/0 hariç
  const suffix = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `${businessPrefix.toUpperCase()}-${suffix}`;
}

/**
 * Dedupe anahtarı üretir (bildirim tekrarını önler).
 * Format: [type]-[relatedId]-[tarih]
 */
export function generateDedupeKey(
  type: string,
  relatedId: string,
  date: Date = new Date()
): string {
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
  return `${type}-${relatedId}-${dateStr}`;
}
