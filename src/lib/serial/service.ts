import { db } from "@/lib/db";
import { nextDocumentNo } from "@/lib/numbering";
import { recordMovement } from "@/lib/stock/service";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import { foldText } from "@/lib/utils/search";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { ProductSerialUnit, StockMovementType } from "@/types";

export class SerialUnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SerialUnitError";
  }
}

const UNIT_COLUMNS = [
  "product_id",
  "serial_number",
  "internal_number",
  "status",
  "machine_id",
  "purchase_item_id",
  "sale_item_id",
  "created_at",
] as const;

export function serialUnitPayload(unit: ProductSerialUnit, update: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: unit.id, business_id: unit.business_id };
  for (const c of UNIT_COLUMNS) payload[c] = unit[c] ?? null;
  if (update) payload.version = unit.version ?? 1;
  return payload;
}

/** Aynı üründe bu seri numarasıyla (harf / Türkçe karakter fark etmeden) birim var mı? */
export async function findUnitBySerial(
  businessId: string,
  productId: string,
  serial: string,
  excludeId?: string
): Promise<ProductSerialUnit | undefined> {
  const wanted = foldText(serial.trim());
  if (!wanted) return undefined;
  return db.product_serial_units
    .where("product_id")
    .equals(productId)
    .filter(
      (u) =>
        u.business_id === businessId &&
        u.id !== excludeId &&
        !!u.serial_number &&
        foldText(u.serial_number.trim()) === wanted
    )
    .first();
}

export type CreateUnitParams = {
  productId: string;
  /** Boşsa birim yalnızca iç numarasıyla (SB-…) tanınır */
  serialNumber?: string;
  /** TL; stok hareketine yazılır */
  unitCost?: number;
  /** Stok girişinin türü: açılış stoğu veya satın alma */
  type: Extract<StockMovementType, "OPENING" | "PURCHASE_IN">;
  purchaseItemId?: string;
  sourceType?: string;
  sourceId?: string;
  note?: string;
};

/**
 * Seri takipli ürüne yeni bir fiziksel birim ekler: iç numara (SB-…) atar,
 * "stokta" durumunda kaydeder ve +1 stok hareketi yazar (ST-012). Çağıran;
 * product_serial_units, products, stock_movements, counters, sync_queue ve
 * audit_logs tablolarını kapsayan bir işlem içinde olmalıdır.
 */
export async function createSerialUnit(ctx: BusinessContext, params: CreateUnitParams): Promise<ProductSerialUnit> {
  const product = await db.products.get(params.productId);
  if (!product || product.business_id !== ctx.businessId) throw new SerialUnitError("Ürün bulunamadı.");
  if (!product.is_serial_tracked) throw new SerialUnitError(`“${product.name}” seri takipli bir ürün değil.`);

  const serial = params.serialNumber?.trim() || undefined;
  if (serial && (await findUnitBySerial(ctx.businessId, params.productId, serial))) {
    throw new SerialUnitError(`“${serial}” seri numarası bu üründe zaten kayıtlı.`);
  }

  const now = nowISO();
  const unit: ProductSerialUnit = {
    id: generateId(),
    business_id: ctx.businessId,
    product_id: params.productId,
    serial_number: serial,
    internal_number: await nextDocumentNo("serialUnit", ctx.deviceCode),
    status: "IN_STOCK",
    purchase_item_id: params.purchaseItemId,
    created_at: now,
    updated_at: now,
  };
  await db.product_serial_units.add(unit);
  await enqueue("product_serial_units", unit.id, "INSERT", serialUnitPayload(unit, false), ctx.deviceCode);

  await recordMovement(ctx, {
    productId: params.productId,
    type: params.type,
    quantity: 1,
    unitCost: params.unitCost,
    serialUnitId: unit.id,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    note: params.note,
  });
  return unit;
}

/** Açılış stoğu: uygulamaya geçmeden önce elde olan bir makineyi kaydeder. */
export async function addOpeningSerialUnit(
  ctx: BusinessContext,
  params: { productId: string; serialNumber?: string; unitCost?: number; note?: string }
): Promise<ProductSerialUnit> {
  return db.transaction(
    "rw",
    [db.product_serial_units, db.products, db.stock_movements, db.counters, db.sync_queue, db.audit_logs],
    () =>
      createSerialUnit(ctx, {
        ...params,
        type: "OPENING",
        sourceType: "OPENING",
        note: params.note ?? "Açılış stoğu",
      })
  );
}

export async function getSerialUnits(productId: string): Promise<ProductSerialUnit[]> {
  const units = await db.product_serial_units.where("product_id").equals(productId).toArray();
  return units.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getInStockUnits(productId: string): Promise<ProductSerialUnit[]> {
  return (await getSerialUnits(productId)).filter((u) => u.status === "IN_STOCK").reverse();
}

/** Birimin ekranda görünen adı: seri numarası, yoksa iç numara. */
export const unitLabel = (unit: Pick<ProductSerialUnit, "serial_number" | "internal_number">): string =>
  unit.serial_number || unit.internal_number || "—";
