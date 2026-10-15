/**
 * Telefon numarası yardımcı araçları.
 * PRD §4.5: Müşteri telefonu normalizasyonu ile mükerrer uyarısı.
 */

/**
 * Telefon numarasını normalize eder.
 * Türkiye formatı: +90 5XX XXX XX XX → 5XXXXXXXXX (10 hane)
 * Arama ve karşılaştırma için sadece rakamlar.
 */
export function normalizePhone(phone: string): string {
  // Sadece rakamları al
  const digits = phone.replace(/\D/g, "");

  // +90 veya 90 ile başlıyorsa kaldır
  if (digits.startsWith("90") && digits.length === 12) {
    return digits.slice(2);
  }

  // 0 ile başlıyorsa kaldır
  if (digits.startsWith("0") && digits.length === 11) {
    return digits.slice(1);
  }

  return digits;
}

/**
 * Telefonu kullanıcıya gösterilecek formata çevirir.
 * Örnek: 5321234567 → 0532 123 45 67
 */
export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length === 10) {
    return `0${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6, 8)} ${normalized.slice(8)}`;
  }
  return phone; // Formatlanamıyorsa olduğu gibi döndür
}

/**
 * İki telefon numarasının aynı kişiye ait olup olmadığını kontrol eder.
 */
export function phonesMatch(phone1: string, phone2: string): boolean {
  return normalizePhone(phone1) === normalizePhone(phone2);
}

/**
 * Telefon numarasının geçerliliğini kontrol eder.
 * Türkiye cep telefonu: 5 ile başlayan 10 hane.
 */
export function isValidTurkishPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^5[0-9]{9}$/.test(normalized);
}
