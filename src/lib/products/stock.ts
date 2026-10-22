import type { Product } from "@/types";

/**
 * Kritik stok: satılabilir miktar, kritik seviyeye eşit veya altındaysa.
 * Hasarlı stok hesaba katılmaz (ST-009).
 */
export function isCriticalStock(
  product: Pick<Product, "stock_available" | "critical_stock_level">
): boolean {
  const level = product.critical_stock_level;
  if (level == null) return false;
  return product.stock_available <= level;
}
