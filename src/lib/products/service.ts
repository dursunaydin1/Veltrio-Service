import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { Product } from "@/types";
import type { ProductFields } from "./schema";

export type ProductContext = {
  businessId: string;
  deviceCode: string;
  /** İşlemi yapan kullanıcı (audit log için) */
  actorId?: string;
};

export class ProductCodeTakenError extends Error {
  constructor(code: string) {
    super(`"${code}" kodlu başka bir ürün zaten var.`);
    this.name = "ProductCodeTakenError";
  }
}

export class ProductNotFoundError extends Error {
  constructor() {
    super("Ürün bulunamadı.");
    this.name = "ProductNotFoundError";
  }
}

/**
 * Kullanıcının düzenleyebildiği sütunlar. Sunucuya yalnızca bunlar gönderilir:
 * stok miktarları (stock_available / stock_damaged) stok hareketleriyle
 * değişir; eski bir yerel değeri güncellemeyle sunucuya yazmak gerçek stoğu
 * ezerdi.
 */
const EDITABLE_COLUMNS = [
  "name",
  "code",
  "category",
  "brand",
  "model",
  "unit",
  "is_serial_tracked",
  "default_sale_price",
  "last_purchase_price",
  "default_tax_mode",
  "default_tax_rate",
  "critical_stock_level",
  "compatible_models_note",
  "storage_location",
  "archived_at",
] as const;

/** Boş alanlar `null` gönderilir; aksi halde sunucu eski değeri korur. */
function editablePayload(product: Product): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: product.id,
    business_id: product.business_id,
  };
  for (const column of EDITABLE_COLUMNS) {
    payload[column] = product[column] ?? null;
  }
  return payload;
}

/** Aynı işletmede (büyük/küçük harf ayrımsız) bu kodu kullanan başka ürün var mı? */
export async function isProductCodeTaken(
  businessId: string,
  code: string,
  excludeId?: string
): Promise<boolean> {
  const wanted = code.trim().toLocaleLowerCase("tr");
  if (!wanted) return false;
  const match = await db.products
    .where("business_id")
    .equals(businessId)
    .filter(
      (p) => p.id !== excludeId && !!p.code && p.code.toLocaleLowerCase("tr") === wanted
    )
    .first();
  return !!match;
}

export async function createProduct(
  ctx: ProductContext,
  fields: ProductFields
): Promise<Product> {
  const now = nowISO();
  const product: Product = {
    ...fields,
    id: generateId(),
    business_id: ctx.businessId,
    // Stok yalnızca stok hareketleriyle değişir (Adım 2.3); yeni ürün 0 ile başlar.
    stock_available: 0,
    stock_damaged: 0,
    created_at: now,
    updated_at: now,
  };

  await db.transaction("rw", db.products, db.sync_queue, async () => {
    if (fields.code && (await isProductCodeTaken(ctx.businessId, fields.code))) {
      throw new ProductCodeTakenError(fields.code);
    }
    await db.products.add(product);
    await enqueue(
      "products",
      product.id,
      "INSERT",
      {
        ...editablePayload(product),
        stock_available: 0,
        stock_damaged: 0,
        created_at: now,
      },
      ctx.deviceCode
    );
  });

  return product;
}

export async function updateProduct(
  ctx: ProductContext,
  id: string,
  fields: ProductFields
): Promise<Product> {
  return db.transaction("rw", db.products, db.sync_queue, async () => {
    const existing = await db.products.get(id);
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new ProductNotFoundError();
    }
    if (fields.code && (await isProductCodeTaken(ctx.businessId, fields.code, id))) {
      throw new ProductCodeTakenError(fields.code);
    }

    const next: Product = { ...existing, ...fields, updated_at: nowISO() };
    // İçerik değişmediyse sürüm artırıp sunucuya boş güncelleme göndermeyelim.
    if (JSON.stringify(editablePayload(existing)) === JSON.stringify(editablePayload(next))) {
      return existing;
    }
    await db.products.put(next);
    // Sunucuya eklenmiş ama henüz geri çekilmemiş kayıtta version yoktur; sunucu 1 ile başlar.
    await enqueue(
      "products",
      id,
      "UPDATE",
      { ...editablePayload(next), version: existing.version ?? 1 },
      ctx.deviceCode
    );
    return next;
  });
}

/**
 * Ürünü pasifleştirir veya yeniden etkinleştirir. Ürün silinmez (geçmiş
 * belgeler ona bağlıdır); arşivleme audit log'a yazılır (Adım 1.8).
 */
export async function setProductArchived(
  ctx: ProductContext,
  id: string,
  archived: boolean,
  reason?: string
): Promise<Product> {
  return db.transaction("rw", db.products, db.sync_queue, db.audit_logs, async () => {
    const existing = await db.products.get(id);
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new ProductNotFoundError();
    }

    const now = nowISO();
    const next: Product = {
      ...existing,
      archived_at: archived ? now : undefined,
      updated_at: now,
    };
    await db.products.put(next);
    await enqueue(
      "products",
      id,
      "UPDATE",
      { ...editablePayload(next), version: existing.version ?? 1 },
      ctx.deviceCode
    );
    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "products",
      entityId: id,
      action: "STATE_CHANGE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason,
      oldValue: { archived_at: existing.archived_at ?? null },
      newValue: { archived_at: next.archived_at ?? null },
    });
    return next;
  });
}

/**
 * Son alış fiyatını (birim maliyet) günceller. Satın alma teslim alınınca
 * çağrılır. Fiyat aynıysa yazmaz. Çağıran, products + sync_queue tablolarını
 * kapsayan bir işlem içinde olmalıdır.
 */
export async function setLastPurchasePrice(
  ctx: ProductContext,
  productId: string,
  unitCost: number
): Promise<void> {
  const existing = await db.products.get(productId);
  if (!existing || existing.business_id !== ctx.businessId) throw new ProductNotFoundError();
  if (existing.last_purchase_price === unitCost) return;

  const next: Product = { ...existing, last_purchase_price: unitCost, updated_at: nowISO() };
  await db.products.put(next);
  await enqueue(
    "products",
    productId,
    "UPDATE",
    { ...editablePayload(next), version: existing.version ?? 1 },
    ctx.deviceCode
  );
}
