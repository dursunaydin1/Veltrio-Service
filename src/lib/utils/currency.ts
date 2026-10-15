/**
 * Para birimi formatlama yardımcı araçları.
 * PRD §3: Tüm para tutarları decimal(15,4) hassasiyetle saklanır.
 * Gösterim: Türkiye locale, TL sembolü.
 */

const TRY_FORMATTER = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/**
 * Sayıyı TL para birimiyle formatlar.
 * Örnek: 1234.5 → "₺1.234,50"
 */
export function formatCurrency(amount: number): string {
  return TRY_FORMATTER.format(amount);
}

/**
 * Sayıyı Türkçe ondalık formatında gösterir.
 * Örnek: 1234.567 → "1.234,567"
 */
export function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

/**
 * Para tutarını 4 ondalık basamakla yuvarlar (veritabanı hassasiyeti).
 */
export function roundAmount(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * KDV hesaplar.
 * taxMode INCLUSIVE: tutar KDV dahil → KDV = tutar - tutar / (1 + oran/100)
 * taxMode EXCLUSIVE: tutar KDV hariç → KDV = tutar * oran / 100
 * taxMode NONE: 0
 */
export function calculateTax(
  amount: number,
  taxRate: number,
  taxMode: "INCLUSIVE" | "EXCLUSIVE" | "NONE"
): { netAmount: number; taxAmount: number; grossAmount: number } {
  if (taxMode === "NONE" || taxRate === 0) {
    return { netAmount: amount, taxAmount: 0, grossAmount: amount };
  }
  if (taxMode === "INCLUSIVE") {
    const netAmount = roundAmount(amount / (1 + taxRate / 100));
    const taxAmount = roundAmount(amount - netAmount);
    return { netAmount, taxAmount, grossAmount: amount };
  }
  // EXCLUSIVE
  const taxAmount = roundAmount(amount * (taxRate / 100));
  const grossAmount = roundAmount(amount + taxAmount);
  return { netAmount: amount, taxAmount, grossAmount };
}
