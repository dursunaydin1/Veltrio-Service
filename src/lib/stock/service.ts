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
  /** Seri takipli ürünlerde hareketin ait olduğu birim (miktar ±1 olmalıdır) */
  serialUnitId?: string;
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
    // Seri takipli ürünün stoğu birim kayıtlarıyla yönetilir (ST-012): hareket yalnızca
    // belirli bir birim için ve ±1 miktarla yazılır (alım, satış, açılış kaydı).
    if (!input.serialUnitId) {
      throw new StockRuleError(
        "Seri takipli ürünlerin stoğu birim kayıtlarıyla yönetilir; elle stok hareketi yapılamaz."
      );
    }
    if (Math.abs(input.quantity) !== 1) {
      throw new StockRuleError("Seri takipli birim hareketi bir adet olmalıdır.");
    }
    const unit = await db.product_serial_units.get(input.serialUnitId);
    if (!unit || unit.product_id !== input.productId || unit.business_id !== ctx.businessId) {
      throw new StockRuleError("Seri birim bulunamadı.");
    }
  } else if (input.serialUnitId) {
    throw new StockRuleError("Seri birim yalnızca seri takipli ürünlerde kullanılır.");
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
    serial_unit_id: input.serialUnitId,
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
      serial_unit_id: movement.serial_unit_id ?? null,
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
  // Seri birim tablosu yalnızca birimli harekette kapsama girer; böylece birimsiz
  // çağrılar (satış, servis parçası…) bu tabloyu içermeyen dış işlemlerde de çalışır.
  const scope = input.serialUnitId ? [...TABLES, db.product_serial_units] : [...TABLES];
  return db.transaction("rw", scope, () => appendMovement(ctx, input));
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

export type DamageAction = "MARK_DAMAGED" | "REPAIRED" | "DISPOSE";

/**
 * Hasarlı stok işlemleri (Adım 2.5, ST-007, ST-011):
 *  MARK_DAMAGED : satılabilirden hasarlıya ayır (çift hareket)
 *  REPAIRED     : hasarlıdan satılabilire aktar — onarıldı (çift hareket)
 *  DISPOSE      : hasarlıdan çık — imha / hurda
 * Neden zorunludur; çift hareketler tek işlemde yazılır (biri başarısızsa
 * hiçbiri yazılmaz) ve ortak bir `source_id` ile bağlanır. Bu işlemlerde
 * negatif stok ayarı dikkate alınmaz: olmayan stok hasarlıya ayrılamaz.
 */
export async function moveDamagedStock(
  ctx: StockContext,
  params: { productId: string; action: DamageAction; quantity: number; reason: string }
): Promise<StockMovement[]> {
  const reason = params.reason.trim();
  if (!reason) throw new StockRuleError("Neden zorunludur.");
  if (!(params.quantity > 0)) {
    throw new StockRuleError("Miktar sıfırdan büyük olmalıdır.");
  }

  const strict: StockContext = { ...ctx, allowNegativeStock: false };
  const groupId = generateId();
  const common = { sourceType: "DAMAGED_TRANSFER", sourceId: groupId, note: reason };
  const q = params.quantity;

  const legs: MovementInput[] =
    params.action === "MARK_DAMAGED"
      ? [
          { productId: params.productId, type: "TRANSFER", bucket: "AVAILABLE", quantity: -q, ...common },
          { productId: params.productId, type: "DAMAGED_IN", bucket: "DAMAGED", quantity: q, ...common },
        ]
      : params.action === "REPAIRED"
        ? [
            { productId: params.productId, type: "TRANSFER", bucket: "DAMAGED", quantity: -q, ...common },
            { productId: params.productId, type: "TRANSFER", bucket: "AVAILABLE", quantity: q, ...common },
          ]
        : [{ productId: params.productId, type: "DAMAGED_DISPOSE", bucket: "DAMAGED", quantity: -q, ...common }];

  return db.transaction("rw", [...TABLES], async () => {
    const read = async () =>
      calcBalance(await db.stock_movements.where("product_id").equals(params.productId).toArray());
    const before = await read();

    const movements: StockMovement[] = [];
    for (const leg of legs) movements.push(await appendMovement(strict, leg));

    const after = await read();
    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "products",
      entityId: params.productId,
      action: "UPDATE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason,
      oldValue: { stock_available: before.available, stock_damaged: before.damaged },
      newValue: { stock_available: after.available, stock_damaged: after.damaged, action: params.action, group_id: groupId },
    });
    return movements;
  });
}
