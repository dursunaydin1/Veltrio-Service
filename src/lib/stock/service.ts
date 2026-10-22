import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import { QTY_SCALE, calcBalance, fromUnits, toUnits } from "@/lib/stock/ledger";
import type { StockBucket, StockMovement, StockMovementType } from "@/types";

export type StockContext = {
  businessId: string;
  deviceCode: string;
  actorId?: string;
  /** İşletme ayarı: stoktan fazla çıkışa izin var mı? (varsayılan false, ST-002) */
  allowNegativeStock?: boolean;
};

/** Stoktan fazla çıkış denendi ve ayar buna izin vermiyor. */
export class InsufficientStockError extends Error {
  constructor(public readonly available: number) {
    super(`Yetersiz stok. Mevcut: ${available}.`);
    this.name = "InsufficientStockError";
  }
}

/** Kural ihlali (geçersiz miktar, nedensiz düzeltme, seri takipli ürün vb.). */
export class StockRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockRuleError";
  }
}

export type MovementInput = {
  productId: string;
  type: StockMovementType;
  bucket?: StockBucket;
  /** İşaretli miktar: + giriş, − çıkış */
  quantity: number;
  unitCost?: number;
  note?: string;
  sourceType?: string;
  sourceId?: string;
};

/**
 * Tek bir hareketi deftere ekler ve eşitleme kuyruğuna yazar.
 * Çağıran, products + stock_movements + sync_queue (+ audit_logs) tablolarını
 * kapsayan bir işlem (transaction) içinde olmalıdır.
 */
async function appendMovement(ctx: StockContext, input: MovementInput): Promise<StockMovement> {
  const bucket: StockBucket = input.bucket ?? "AVAILABLE";

  if (!Number.isFinite(input.quantity) || input.quantity === 0) {
    throw new StockRuleError("Miktar sıfırdan farklı bir sayı olmalıdır.");
  }
  if (Math.abs(toUnits(input.quantity) - input.quantity * QTY_SCALE) > 1e-6) {
    throw new StockRuleError("Miktar en fazla 4 ondalık basamak içerebilir.");
  }

  const product = await db.products.get(input.productId);
  if (!product || product.business_id !== ctx.businessId) {
    throw new StockRuleError("Ürün bulunamadı.");
  }
  if (product.is_serial_tracked) {
    throw new StockRuleError(
      "Seri takipli ürünlerin stoğu birim kayıtlarıyla yönetilir; elle stok hareketi yapılamaz."
    );
  }

  const note = input.note?.trim() || undefined;

  if (input.quantity < 0) {
    const balance = calcBalance(
      await db.stock_movements.where("product_id").equals(input.productId).toArray()
    );
    const current = bucket === "DAMAGED" ? balance.damaged : balance.available;
    if (fromUnits(toUnits(current) + toUnits(input.quantity)) < 0) {
      // Hasarlı stok hiçbir zaman eksiye düşemez; satılabilir stok yalnızca ayar açıksa.
      if (bucket === "DAMAGED" || !ctx.allowNegativeStock) {
        throw new InsufficientStockError(current);
      }
      if (!note) {
        throw new StockRuleError("Stok eksiye düşeceği için neden yazmalısınız.");
      }
    }
  }

  const movement: StockMovement = {
    id: generateId(),
    business_id: ctx.businessId,
    product_id: input.productId,
    movement_type: input.type,
    bucket,
    quantity: input.quantity,
    unit_cost: input.unitCost,
    source_type: input.sourceType,
    source_id: input.sourceId,
    note,
    created_by_device: ctx.deviceCode,
    created_at: nowISO(),
  };

  await db.stock_movements.add(movement);
  await enqueue(
    "stock_movements",
    movement.id,
    "INSERT",
    {
      id: movement.id,
      business_id: movement.business_id,
      product_id: movement.product_id,
      movement_type: movement.movement_type,
      bucket: movement.bucket,
      quantity: movement.quantity,
      unit_cost: movement.unit_cost ?? null,
      source_type: movement.source_type ?? null,
      source_id: movement.source_id ?? null,
      note: movement.note ?? null,
      created_by_device: movement.created_by_device,
      created_at: movement.created_at,
    },
    ctx.deviceCode
  );
  return movement;
}

const TABLES = [db.products, db.stock_movements, db.sync_queue, db.audit_logs] as const;

/**
 * Tek bir stok hareketi kaydeder (satış, servis parçası, iade vb. fazlarda da
 * bu çekirdek kullanılır). Negatif stok kuralı burada uygulanır:
 * satılabilir stok ancak işletme ayarı açıksa ve neden yazılırsa eksiye düşer;
 * hasarlı stok hiçbir zaman eksiye düşemez.
 */
export function recordMovement(ctx: StockContext, input: MovementInput): Promise<StockMovement> {
  return db.transaction("rw", [...TABLES], () => appendMovement(ctx, input));
}

/**
 * Stok girişi (açılış stoğu veya elle giriş). Satın alma girişleri Faz 4'te
 * satın alma belgesiyle birlikte kendi hareketini üretecek.
 */
export async function addStock(
  ctx: StockContext,
  params: {
    productId: string;
    quantity: number;
    type?: "OPENING" | "PURCHASE_IN";
    unitCost?: number;
    note?: string;
  }
): Promise<StockMovement> {
  if (!(params.quantity > 0)) {
    throw new StockRuleError("Giriş miktarı sıfırdan büyük olmalıdır.");
  }
  return db.transaction("rw", [...TABLES], () =>
    appendMovement(ctx, {
      productId: params.productId,
      type: params.type ?? "OPENING",
      quantity: params.quantity,
      unitCost: params.unitCost,
      note: params.note,
      sourceType: params.type === "PURCHASE_IN" ? "PURCHASE" : "OPENING",
    })
  );
}

/**
 * Stok düzeltme (Adım 2.6): kullanıcı yeni miktarı girer, fark otomatik
 * hesaplanır ve yeni bir hareket olarak eklenir; geçmiş hareketler silinmez
 * (ST-008). Neden zorunludur ve audit log'a yazılır.
 */
export async function adjustStock(
  ctx: StockContext,
  params: { productId: string; newQuantity: number; reason: string }
): Promise<{ movement: StockMovement; before: number; after: number }> {
  const reason = params.reason.trim();
  if (!reason) throw new StockRuleError("Düzeltme nedeni zorunludur.");
  if (!(params.newQuantity >= 0)) {
    throw new StockRuleError("Yeni miktar sıfır veya daha büyük olmalıdır.");
  }

  return db.transaction("rw", [...TABLES], async () => {
    const balance = calcBalance(
      await db.stock_movements.where("product_id").equals(params.productId).toArray()
    );
    const diffUnits = toUnits(params.newQuantity) - toUnits(balance.available);
    if (diffUnits === 0) {
      throw new StockRuleError("Yeni miktar mevcut stokla aynı; düzeltme gerekmiyor.");
    }
    const diff = fromUnits(diffUnits);

    const movement = await appendMovement(ctx, {
      productId: params.productId,
      type: diff > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
      quantity: diff,
      note: reason,
      sourceType: "ADJUSTMENT",
    });

    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "products",
      entityId: params.productId,
      action: "UPDATE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason,
      oldValue: { stock_available: balance.available },
      newValue: { stock_available: params.newQuantity, movement_id: movement.id },
    });

    return { movement, before: balance.available, after: params.newQuantity };
  });
}
