import { db } from "@/lib/db";
import { getBalances } from "@/lib/stock/ledger";
import { formatQuantity } from "@/lib/utils";
import { reconcileNotifications, type NotificationContext, type PlannedNotification } from "./core";

/**
 * Stok bildirimleri (PRD §14, ST-009, ST-003, AC-009, AC-028):
 *  - Kritik stok: satılabilir miktar kritik seviyeye eşit veya altına ilk indiğinde
 *    bir bildirim; çözülmeden yinelenmez, miktar toparlanınca çözülür, tekrar
 *    düşerse yeni bildirim açılır. Hasarlı stok hesaba katılmaz.
 *  - Eksi stok: eşitlemede iki cihazın aynı stoğu tüketmesi gibi durumlarda stok
 *    eksiye düşerse çakışma bildirimi; telafi için stok düzeltmesi önerilir.
 */

export type StockFacts = {
  id: string;
  name: string;
  unit?: string;
  available: number;
  criticalLevel?: number;
};

/** Kritik seviyede veya altında mı? (hasarlı stok sayılmaz) */
export const isLow = (f: StockFacts) => f.criticalLevel != null && f.available <= f.criticalLevel;

/** Bugünkü duruma göre açık olması gereken stok bildirimleri; `episode` tekrar düşüşte artan sayaçtır. */
export function planStockNotifications(
  facts: StockFacts[],
  episodes: Map<string, { low: number; negative: number; lowOpen: boolean; negativeOpen: boolean }>
): { low: PlannedNotification[]; negative: PlannedNotification[]; lowActive: Set<string>; negativeActive: Set<string> } {
  const low: PlannedNotification[] = [];
  const negative: PlannedNotification[] = [];
  const lowActive = new Set<string>();
  const negativeActive = new Set<string>();

  for (const f of facts) {
    const ep = episodes.get(f.id) ?? { low: 0, negative: 0, lowOpen: false, negativeOpen: false };
    if (isLow(f)) {
      lowActive.add(f.id);
      // Açık bildirim varsa yenisi üretilmez; yoksa yeni düşüş = yeni sayaç
      const n = ep.lowOpen ? ep.low : ep.low + 1;
      low.push({
        type: "LOW_STOCK",
        dedupeKey: `LOW_STOCK:${f.id}:${n}`,
        relatedId: f.id,
        message: `Kritik stok: ${f.name} — ${formatQuantity(f.available)} kaldı (seviye ${formatQuantity(f.criticalLevel as number)})`,
      });
    }
    if (f.available < 0) {
      negativeActive.add(f.id);
      const n = ep.negativeOpen ? ep.negative : ep.negative + 1;
      negative.push({
        type: "SYNC_CONFLICT",
        dedupeKey: `NEGATIVE_STOCK:${f.id}:${n}`,
        relatedId: f.id,
        message: `Stok eksiye düştü: ${f.name} (${formatQuantity(f.available)}). Başka cihazdaki işlemle çakışmış olabilir; stok düzeltmesi yapın veya işlemi iptal edin.`,
      });
    }
  }
  return { low, negative, lowActive, negativeActive };
}

export async function loadStockFacts(businessId: string): Promise<StockFacts[]> {
  const [products, balances] = await Promise.all([
    db.products.where("business_id").equals(businessId).filter((p) => !p.archived_at).toArray(),
    getBalances(businessId),
  ]);
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    available: balances.get(p.id)?.available ?? 0,
    criticalLevel: p.critical_stock_level ?? undefined,
  }));
}

/** Kritik / eksi stok bildirimlerini günceller; yeni üretilen bildirim sayısını döner. */
export async function syncStockNotifications(ctx: NotificationContext): Promise<number> {
  const facts = await loadStockFacts(ctx.businessId);

  const episodes = new Map<string, { low: number; negative: number; lowOpen: boolean; negativeOpen: boolean }>();
  const existing = await db.notifications
    .where("business_id")
    .equals(ctx.businessId)
    .filter((n) => n.type === "LOW_STOCK" || n.dedupe_key.startsWith("NEGATIVE_STOCK:"))
    .toArray();
  for (const n of existing) {
    const [prefix, productId, rawN] = n.dedupe_key.split(":");
    const ep = episodes.get(productId) ?? { low: 0, negative: 0, lowOpen: false, negativeOpen: false };
    const count = Number(rawN) || 0;
    if (prefix === "LOW_STOCK") {
      ep.low = Math.max(ep.low, count);
      if (!n.resolved_at) ep.lowOpen = true;
    } else {
      ep.negative = Math.max(ep.negative, count);
      if (!n.resolved_at) ep.negativeOpen = true;
    }
    episodes.set(productId, ep);
  }

  const plan = planStockNotifications(facts, episodes);
  const lowCreated = await reconcileNotifications(ctx, "LOW_STOCK", plan.low, (n) => !plan.lowActive.has(n.relatedId));
  const negCreated = await reconcileNotifications(
    ctx,
    "SYNC_CONFLICT",
    plan.negative,
    (n) => n.dedupeKey.startsWith("NEGATIVE_STOCK:") && !plan.negativeActive.has(n.relatedId)
  );
  return lowCreated + negCreated;
}
