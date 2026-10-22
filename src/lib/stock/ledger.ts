import { db } from "@/lib/db";
import type { StockMovement } from "@/types";

/** Miktarlar 4 ondalık basamağa kadar; toplamlar tam sayı üzerinden yapılır. */
export const QTY_SCALE = 10_000;

export const toUnits = (quantity: number): number => Math.round(quantity * QTY_SCALE);
export const fromUnits = (units: number): number => units / QTY_SCALE;

export type StockBalance = { available: number; damaged: number };

export const EMPTY_BALANCE: StockBalance = { available: 0, damaged: 0 };

type MovementLike = Pick<StockMovement, "quantity"> & { bucket?: StockMovement["bucket"] };

/**
 * Hareket defterinden bakiye hesaplar (ST-013). Stok miktarı hiçbir yerde
 * "saklanan" değere güvenilerek gösterilmez; yerelde henüz eşitlenmemiş
 * hareketler de otomatik dahil olur.
 */
export function calcBalance(movements: MovementLike[]): StockBalance {
  let available = 0;
  let damaged = 0;
  for (const m of movements) {
    if (m.bucket === "DAMAGED") damaged += toUnits(m.quantity);
    else available += toUnits(m.quantity);
  }
  return { available: fromUnits(available), damaged: fromUnits(damaged) };
}

export async function getProductBalance(productId: string): Promise<StockBalance> {
  const movements = await db.stock_movements.where("product_id").equals(productId).toArray();
  return calcBalance(movements);
}

/** İşletmedeki tüm ürünlerin bakiyesi (liste ekranı için tek geçiş). */
export async function getBalances(businessId: string): Promise<Map<string, StockBalance>> {
  const byProduct = new Map<string, MovementLike[]>();
  await db.stock_movements
    .where("business_id")
    .equals(businessId)
    .each((m) => {
      const list = byProduct.get(m.product_id);
      if (list) list.push(m);
      else byProduct.set(m.product_id, [m]);
    });

  const result = new Map<string, StockBalance>();
  for (const [productId, movements] of byProduct) {
    result.set(productId, calcBalance(movements));
  }
  return result;
}
