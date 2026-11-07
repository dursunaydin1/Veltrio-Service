import { parseQuantityInput } from "@/lib/calc";

/**
 * − / + düğmesi için (K-097, K-098): miktarı `delta` kadar değiştirir, `min`in altına inmez.
 * Boş ya da geçersiz miktar `min` olur. Sonuç form kutusu biçimindedir ("2,5").
 */
export function stepQuantity(value: string, delta: number, min = 1): string {
  const current = parseQuantityInput(value);
  if (current === null) return String(min);
  const next = Math.max(min, Math.round((current + delta) * 1000) / 1000);
  return String(next).replace(".", ",");
}
