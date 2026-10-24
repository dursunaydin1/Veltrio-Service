import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/sync/audit";
import { fromUnits, getBalances, toUnits } from "./ledger";
import type { BusinessContext } from "@/hooks/useBusinessContext";

/**
 * Stok bütünlük denetimi (ST-013, AC-050, TC-054): ürün üzerindeki stok özeti
 * (önbellek) ile hareket defterinden hesaplanan miktar karşılaştırılır. Fark
 * bulunursa **hareketler esas alınır**, önbellek düzeltilir ve audit log'a yazılır.
 * Hareketler hiçbir zaman bu işlemle değiştirilmez.
 */

export type StockMismatch = {
  productId: string;
  name: string;
  cachedAvailable: number;
  cachedDamaged: number;
  ledgerAvailable: number;
  ledgerDamaged: number;
};

/** Yalnızca farkı bulur (yazmaz). */
export async function findStockMismatches(businessId: string): Promise<StockMismatch[]> {
  const [products, balances] = await Promise.all([
    db.products.where("business_id").equals(businessId).toArray(),
    getBalances(businessId),
  ]);
  const out: StockMismatch[] = [];
  for (const p of products) {
    const ledger = balances.get(p.id) ?? { available: 0, damaged: 0 };
    const sameAvailable = toUnits(p.stock_available ?? 0) === toUnits(ledger.available);
    const sameDamaged = toUnits(p.stock_damaged ?? 0) === toUnits(ledger.damaged);
    if (sameAvailable && sameDamaged) continue;
    out.push({
      productId: p.id,
      name: p.name,
      cachedAvailable: p.stock_available ?? 0,
      cachedDamaged: p.stock_damaged ?? 0,
      ledgerAvailable: fromUnits(toUnits(ledger.available)),
      ledgerDamaged: fromUnits(toUnits(ledger.damaged)),
    });
  }
  return out;
}

/**
 * Farkları bulur, yerel önbelleği hareket defterine göre düzeltir ve her fark için
 * audit log yazar. Sunucudaki özet, sunucu tetikleyicisiyle zaten hareketlerden güncellenir.
 */
export async function repairStockMismatches(ctx: BusinessContext): Promise<StockMismatch[]> {
  const mismatches = await findStockMismatches(ctx.businessId);
  if (mismatches.length === 0) return [];
  await db.transaction("rw", db.products, db.audit_logs, db.sync_queue, async () => {
    for (const m of mismatches) {
      const product = await db.products.get(m.productId);
      if (!product) continue;
      // Önbellek alanları yalnızca yerelde düzeltilir; sunucuya gönderilmez (stok sunucuda hareketlerle değişir)
      await db.products.put({ ...product, stock_available: m.ledgerAvailable, stock_damaged: m.ledgerDamaged });
      await writeAuditLog({
        businessId: ctx.businessId,
        entityType: "products",
        entityId: m.productId,
        action: "UPDATE",
        deviceCode: ctx.deviceCode,
        actorId: ctx.actorId,
        reason: "Stok özeti hareket defterine göre yeniden hesaplandı",
        oldValue: { stock_available: m.cachedAvailable, stock_damaged: m.cachedDamaged },
        newValue: { stock_available: m.ledgerAvailable, stock_damaged: m.ledgerDamaged },
      });
    }
  });
  return mismatches;
}
