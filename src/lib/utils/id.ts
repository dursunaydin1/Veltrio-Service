import { v4 as uuidv4 } from "uuid";

/**
 * UUID v4 üretir.
 * PRD §3: Tüm birincil anahtarlar client tarafında UUID v4 olarak üretilir.
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Servis belge numarası üretir.
 * Format: SRV-[cihaz_kodu]-[yıl]-[sıra_no]
 * Örnek: SRV-ABC1-2025-00042
 */
export function generateServiceNo(
  deviceCode: string,
  sequence: number
): string {
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(5, "0");
  return `SRV-${deviceCode}-${year}-${seq}`;
}

/**
 * Satış belge numarası üretir.
 * Format: SAT-[cihaz_kodu]-[yıl]-[sıra_no]
 */
export function generateSaleNo(
  deviceCode: string,
  sequence: number
): string {
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(5, "0");
  return `SAT-${deviceCode}-${year}-${seq}`;
}

/**
 * Satın alma belge numarası üretir.
 * Format: AL-[cihaz_kodu]-[yıl]-[sıra_no]
 */
export function generatePurchaseNo(
  deviceCode: string,
  sequence: number
): string {
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(5, "0");
  return `AL-${deviceCode}-${year}-${seq}`;
}

/**
 * İade belge numarası üretir.
 * Format: IAD-[cihaz_kodu]-[yıl]-[sıra_no]
 */
export function generateReturnNo(
  deviceCode: string,
  sequence: number
): string {
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(5, "0");
  return `IAD-${deviceCode}-${year}-${seq}`;
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
