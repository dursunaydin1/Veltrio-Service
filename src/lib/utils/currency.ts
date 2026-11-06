/**
 * Para birimi formatlama yardımcı araçları.
 * PRD §3: Tüm para tutarları decimal(15,4) hassasiyetle saklanır; hesap `@/lib/calc` ile kuruşla yapılır.
 * Gösterim: Türkiye locale, TL sembolü. Burada yalnızca gösterim ve form biçimi var, hesap yok.
 */

const TRY_FORMATTER = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Sayıyı TL para birimiyle formatlar.
 * Örnek: 1234.5 → "₺1.234,50"
 */
export function formatCurrency(amount: number): string {
  return TRY_FORMATTER.format(amount);
}

const QUANTITY_FORMATTER = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

/**
 * Stok miktarını gereksiz sıfır olmadan gösterir (en fazla 4 ondalık).
 * Örnek: 10 → "10", 2.5 → "2,5", 1234.5 → "1.234,5"
 */
export function formatQuantity(value: number): string {
  return QUANTITY_FORMATTER.format(value);
}

/**
 * Kuruş cinsinden tutarı TL olarak gösterir (para hesabı kuruşla yapılır, `@/lib/calc`).
 * Örnek: 123450 → "₺1.234,50"
 */
export function formatKurus(kurus: number): string {
  return formatCurrency(kurus / 100);
}

/**
 * Form kutusuna yazılacak tutar: binlik ayırıcısız, virgüllü (`parseMoneyInput` geri okur).
 * Örnek: 1234.5 → "1234,50"
 */
export function moneyInput(tl: number): string {
  return tl.toFixed(2).replace(".", ",");
}

/** Kuruştan form kutusu tutarı. Örnek: 123450 → "1234,50" */
export function moneyInputFromKurus(kurus: number): string {
  return moneyInput(kurus / 100);
}
