import { db } from "@/lib/db";
import type { Purchase, PurchaseItem } from "@/lib/db";
import { CALC_VERSION, calcLine, fromKurus, toKurus } from "@/lib/calc";
import { recordSupplierPayment } from "@/lib/finance/service";
import { nextDocumentNo } from "@/lib/numbering";
import { setLastPurchasePrice } from "@/lib/products/service";
import { createSerialUnit } from "@/lib/serial/service";
import { foldText } from "@/lib/utils/search";
import { recordMovement } from "@/lib/stock/service";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { Payment, PaymentMethod, TaxMode } from "@/types";

export class PurchaseRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseRuleError";
  }
}

export type PurchaseLineInput = {
  productId: string;
  quantity: number;
  /** kuruş */
  unitPriceKurus: number;
  /** satırın toplam indirimi, kuruş */
  discountKurus?: number;
  taxMode: TaxMode;
  taxRate: number;
  /**
   * Seri takipli ürünlerde seri numaraları (en fazla miktar kadar; girilmeyen birim
   * iç numarasıyla (SB-…) tanınır). Teslim alınınca her biri ayrı birim olur.
   */
  serialNumbers?: string[];
};

export type PurchaseInput = {
  supplierId: string;
  /** YYYY-MM-DD; boşsa şimdi */
  purchaseDate?: string;
  /** Tedarikçinin fatura / irsaliye no'su (bilgi amaçlı) */
  supplierRef?: string;
  notes?: string;
  /** Ayrıntılı alım: ürün satırları. Boşsa `manualTotalKurus` zorunlu (hızlı alım). */
  lines: PurchaseLineInput[];
  /** Hızlı alım: yalnızca toplam tutar. Stok değişmez (§9.5). */
  manualTotalKurus?: number;
};

const PURCHASE_COLUMNS = [
  "supplier_id",
  "document_no",
  "purchase_date",
  "total_amount",
  "status",
  "notes",
  "supplier_ref",
  "received_at",
  "cancel_reason",
  "calc_version",
  "created_by_device",
  "created_at",
] as const;
const PURCHASE_UPDATE_COLUMNS = PURCHASE_COLUMNS.filter(
  (c) => !["document_no", "created_by_device", "created_at"].includes(c)
);

const ITEM_COLUMNS = [
  "purchase_id",
  "product_id",
  "description_snapshot",
  "quantity",
  "unit",
  "unit_price",
  "line_discount",
  "tax_mode",
  "tax_rate",
  "line_total",
  "stock_movement_id",
  "serial_numbers",
  "created_at",
] as const;

function purchasePayload(p: Purchase, update: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: p.id, business_id: p.business_id };
  for (const c of update ? PURCHASE_UPDATE_COLUMNS : PURCHASE_COLUMNS) payload[c] = p[c] ?? null;
  if (update) payload.version = p.version ?? 1;
  return payload;
}

function itemPayload(i: PurchaseItem & { version?: number }, update: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: i.id, business_id: i.business_id };
  for (const c of ITEM_COLUMNS) payload[c] = i[c] ?? null;
  if (update) payload.version = i.version ?? 1;
  return payload;
}

const isoOf = (date?: string): string => {
  if (!date) return nowISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new PurchaseRuleError("Alım tarihi geçersiz.");
  return `${date}T12:00:00.000Z`;
};

const tidy = (v?: string) => v?.trim() || undefined;

function tables() {
  return [
    db.purchases,
    db.purchase_items,
    db.suppliers,
    db.products,
    db.stock_movements,
    db.product_serial_units,
    db.payments,
    db.counters,
    db.sync_queue,
    db.audit_logs,
  ] as const;
}

/** Satırları doğrular, tutarlarını kuruş hassasiyetiyle hesaplar (vergi bilgi amaçlıdır, §9.5). */
async function buildItems(
  ctx: BusinessContext,
  purchaseId: string,
  lines: PurchaseLineInput[],
  createdAt: string
): Promise<{ items: PurchaseItem[]; totalKurus: number }> {
  const items: PurchaseItem[] = [];
  let totalKurus = 0;

  for (const [index, line] of lines.entries()) {
    const product = await db.products.get(line.productId);
    if (!product || product.business_id !== ctx.businessId) throw new PurchaseRuleError("Ürün bulunamadı.");
    if (product.archived_at) throw new PurchaseRuleError(`“${product.name}” pasif ürün; alıma eklenemez.`);
    if (!(line.quantity > 0)) throw new PurchaseRuleError("Miktar sıfırdan büyük olmalıdır.");

    // Seri takipli ürün: tam sayı adet, seri numaraları benzersiz ve adetten fazla değil.
    let serialNumbers: string[] | undefined;
    if (product.is_serial_tracked) {
      if (!Number.isInteger(line.quantity)) {
        throw new PurchaseRuleError(`“${product.name}” seri takipli; miktar tam sayı olmalıdır.`);
      }
      serialNumbers = (line.serialNumbers ?? []).map((s) => s.trim());
      if (serialNumbers.length > line.quantity) {
        throw new PurchaseRuleError(`“${product.name}”: ${line.quantity} adet için en fazla ${line.quantity} seri numarası girilebilir.`);
      }
      const given = serialNumbers.filter(Boolean).map(foldText);
      if (new Set(given).size !== given.length) {
        throw new PurchaseRuleError(`“${product.name}”: aynı seri numarası birden fazla girilmiş.`);
      }
    } else if (line.serialNumbers?.some((s) => s.trim())) {
      throw new PurchaseRuleError(`“${product.name}” seri takipli bir ürün değil; seri numarası girilemez.`);
    }

    let lineKurus: number;
    try {
      lineKurus = calcLine({
        unitPrice: line.unitPriceKurus,
        quantity: line.quantity,
        discount: line.discountKurus ?? 0,
        taxMode: line.taxMode,
        taxRate: line.taxRate,
      }).total;
    } catch (e) {
      throw new PurchaseRuleError(e instanceof Error ? e.message : "Tutar hesaplanamadı.");
    }

    totalKurus += lineKurus;
    items.push({
      id: generateId(),
      business_id: ctx.businessId,
      purchase_id: purchaseId,
      product_id: product.id,
      description_snapshot: product.name,
      quantity: line.quantity,
      unit: product.unit,
      unit_price: fromKurus(line.unitPriceKurus),
      line_discount: fromKurus(line.discountKurus ?? 0),
      tax_mode: line.taxMode,
      tax_rate: line.taxRate,
      line_total: fromKurus(lineKurus),
      serial_numbers: serialNumbers ?? null,
      // Satır sırası korunsun diye her satıra 1 ms eklenir (aynı anda eklenen kayıtların sırası belirsizdir).
      created_at: new Date(Date.parse(createdAt) + index).toISOString(),
    });
  }
  return { items, totalKurus };
}

async function validateInput(ctx: BusinessContext, input: PurchaseInput): Promise<void> {
  const supplier = await db.suppliers.get(input.supplierId);
  if (!supplier || supplier.business_id !== ctx.businessId) throw new PurchaseRuleError("Tedarikçi bulunamadı.");
  if (supplier.archived_at) throw new PurchaseRuleError("Arşivlenmiş tedarikçiden alım yapılamaz.");

  const hasLines = input.lines.length > 0;
  const hasManual = input.manualTotalKurus !== undefined;
  if (hasLines && hasManual) {
    throw new PurchaseRuleError("Ürün satırı varken ayrıca toplam tutar girilemez.");
  }
  if (!hasLines) {
    if (!hasManual || !Number.isInteger(input.manualTotalKurus) || (input.manualTotalKurus as number) <= 0) {
      throw new PurchaseRuleError("Ürün satırı ekleyin ya da hızlı alım için toplam tutarı girin.");
    }
  }
}

/** Satırları (varsa) hesaplayıp alımı yazar; taslak oluşturma ve düzenleme için ortak. */
async function persist(
  ctx: BusinessContext,
  input: PurchaseInput,
  existing?: Purchase
): Promise<Purchase> {
  await validateInput(ctx, input);
  const now = nowISO();
  const id = existing?.id ?? generateId();
  const { items, totalKurus } = await buildItems(ctx, id, input.lines, now);

  const purchase: Purchase = {
    ...(existing ?? {
      id,
      business_id: ctx.businessId,
      document_no: await nextDocumentNo("purchase", ctx.deviceCode),
      status: "DRAFT" as const,
      calc_version: CALC_VERSION,
      created_by_device: ctx.deviceCode,
      created_at: now,
    }),
    supplier_id: input.supplierId,
    purchase_date: isoOf(input.purchaseDate),
    total_amount: fromKurus(input.lines.length > 0 ? totalKurus : (input.manualTotalKurus as number)),
    notes: tidy(input.notes),
    supplier_ref: tidy(input.supplierRef),
    updated_at: now,
  };

  if (existing) {
    // Taslak düzenleme: eski satırlar silinir, yenileri eklenir.
    const old = await db.purchase_items.where("purchase_id").equals(id).toArray();
    for (const o of old) {
      await db.purchase_items.delete(o.id);
      await enqueue("purchase_items", o.id, "DELETE", itemPayload(o, true), ctx.deviceCode);
    }
    await db.purchases.put(purchase);
    await enqueue("purchases", id, "UPDATE", purchasePayload(purchase, true), ctx.deviceCode);
  } else {
    await db.purchases.add(purchase);
    await enqueue("purchases", id, "INSERT", purchasePayload(purchase, false), ctx.deviceCode);
  }

  for (const item of items) {
    await db.purchase_items.add(item);
    await enqueue("purchase_items", item.id, "INSERT", itemPayload(item, false), ctx.deviceCode);
  }
  return purchase;
}

/**
 * Teslim alma: stok artar (PURCHASE_IN, birim maliyetle), ürünün son alış
 * fiyatı güncellenir, alım tedarikçinin borcuna eklenir. Birim maliyet,
 * KDV dahil satır toplamı / miktardır: KDV indirilmediği için maliyetin parçasıdır.
 * Taslak (DRAFT) belge stok ve finans hareketi üretmez (ST-006).
 */
async function applyReceive(ctx: BusinessContext, purchase: Purchase): Promise<Purchase> {
  const items = await db.purchase_items.where("purchase_id").equals(purchase.id).toArray();

  for (const item of items) {
    if (!item.product_id) continue;
    const unitCost = Math.round((item.line_total / item.quantity) * 10000) / 10000;
    const product = await db.products.get(item.product_id);

    if (product?.is_serial_tracked) {
      // Her fiziksel birim ayrı kayıt + ayrı +1 hareket (ST-012).
      for (let n = 0; n < item.quantity; n++) {
        await createSerialUnit(ctx, {
          productId: item.product_id,
          serialNumber: item.serial_numbers?.[n] || undefined,
          unitCost,
          type: "PURCHASE_IN",
          purchaseItemId: item.id,
          sourceType: "PURCHASE",
          sourceId: purchase.id,
          note: purchase.document_no,
        });
      }
      await setLastPurchasePrice(ctx, item.product_id, unitCost);
      continue;
    }

    const movement = await recordMovement(ctx, {
      productId: item.product_id,
      type: "PURCHASE_IN",
      quantity: item.quantity,
      unitCost,
      sourceType: "PURCHASE",
      sourceId: purchase.id,
      note: purchase.document_no,
    });
    const next = { ...item, stock_movement_id: movement.id } as PurchaseItem & { version?: number };
    await db.purchase_items.put(next);
    await enqueue("purchase_items", item.id, "UPDATE", itemPayload(next, true), ctx.deviceCode);
    await setLastPurchasePrice(ctx, item.product_id, unitCost);
  }

  const now = nowISO();
  const received: Purchase = { ...purchase, status: "RECEIVED", received_at: now, updated_at: now };
  await db.purchases.put(received);
  await enqueue("purchases", purchase.id, "UPDATE", purchasePayload(received, true), ctx.deviceCode);
  return received;
}

export type PurchaseCreateOptions = {
  /** true: oluşturulurken teslim alınır (stok girişi yapılır); false: taslak */
  receive: boolean;
  /** Teslim alırken yapılan ödeme */
  payment?: { amountKurus: number; method: PaymentMethod };
};

/** Alım oluşturur: taslak olarak ya da doğrudan teslim alınmış olarak (hızlı alım dahil). */
export async function createPurchase(
  ctx: BusinessContext,
  input: PurchaseInput,
  options: PurchaseCreateOptions
): Promise<Purchase> {
  if (options.payment && !options.receive) {
    throw new PurchaseRuleError("Ödeme, alım teslim alındıktan sonra kaydedilir.");
  }
  return db.transaction("rw", [...tables()], async () => {
    let purchase = await persist(ctx, input);
    if (options.receive) {
      purchase = await applyReceive(ctx, purchase);
      if (options.payment) {
        await recordSupplierPayment(ctx, {
          supplierId: input.supplierId,
          direction: "OUT",
          method: options.payment.method,
          amountKurus: options.payment.amountKurus,
          note: `Alım ödemesi (${purchase.document_no})`,
          sourceType: "PURCHASE",
          sourceId: purchase.id,
        });
      }
    }
    return purchase;
  });
}

async function loadDraft(ctx: BusinessContext, id: string): Promise<Purchase> {
  const purchase = await db.purchases.get(id);
  if (!purchase || purchase.business_id !== ctx.businessId) throw new PurchaseRuleError("Alım bulunamadı.");
  if (purchase.status !== "DRAFT") {
    throw new PurchaseRuleError(
      "Yalnızca taslak alım düzenlenebilir. Teslim alınmış alımdaki hatalar tedarikçiye iade ile düzeltilir."
    );
  }
  return purchase;
}

/** Taslak alımı günceller (tedarikçi, tarih, satırlar). */
export async function updateDraftPurchase(
  ctx: BusinessContext,
  id: string,
  input: PurchaseInput
): Promise<Purchase> {
  return db.transaction("rw", [...tables()], async () => persist(ctx, input, await loadDraft(ctx, id)));
}

/** Taslak alımı teslim alır (stok girişi + son alış fiyatı + tedarikçi borcu). */
export async function receivePurchase(
  ctx: BusinessContext,
  id: string,
  payment?: { amountKurus: number; method: PaymentMethod }
): Promise<Purchase> {
  return db.transaction("rw", [...tables()], async () => {
    const draft = await loadDraft(ctx, id);
    const received = await applyReceive(ctx, draft);
    if (payment && draft.supplier_id) {
      await recordSupplierPayment(ctx, {
        supplierId: draft.supplier_id,
        direction: "OUT",
        method: payment.method,
        amountKurus: payment.amountKurus,
        note: `Alım ödemesi (${draft.document_no})`,
        sourceType: "PURCHASE",
        sourceId: id,
      });
    }
    return received;
  });
}

/** Taslak alımı iptal eder (neden zorunlu). Stok ve finans etkisi yoktur. */
export async function cancelDraftPurchase(ctx: BusinessContext, id: string, reason: string): Promise<Purchase> {
  const why = reason.trim();
  if (!why) throw new PurchaseRuleError("İptal nedeni zorunludur.");
  return db.transaction("rw", [...tables()], async () => {
    const draft = await loadDraft(ctx, id);
    const next: Purchase = { ...draft, status: "CANCELLED", cancel_reason: why, updated_at: nowISO() };
    await db.purchases.put(next);
    await enqueue("purchases", id, "UPDATE", purchasePayload(next, true), ctx.deviceCode);
    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "purchases",
      entityId: id,
      action: "STATE_CHANGE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason: why,
      oldValue: { status: "DRAFT" },
      newValue: { status: "CANCELLED" },
    });
    return next;
  });
}

/** Teslim alınmış alıma bağlı ödeme (alım sonrası tedarikçiye ödeme). */
export async function payPurchase(
  ctx: BusinessContext,
  id: string,
  params: { amountKurus: number; method: PaymentMethod; note?: string }
): Promise<Payment> {
  return db.transaction("rw", [db.purchases, db.suppliers, db.payments, db.sync_queue], async () => {
    const purchase = await db.purchases.get(id);
    if (!purchase || purchase.business_id !== ctx.businessId) throw new PurchaseRuleError("Alım bulunamadı.");
    if (purchase.status !== "RECEIVED" || !purchase.supplier_id) {
      throw new PurchaseRuleError("Ödeme yalnızca teslim alınmış alım için kaydedilir.");
    }
    return recordSupplierPayment(ctx, {
      supplierId: purchase.supplier_id,
      direction: "OUT",
      method: params.method,
      amountKurus: params.amountKurus,
      note: params.note?.trim() || `Alım ödemesi (${purchase.document_no})`,
      sourceType: "PURCHASE",
      sourceId: id,
    });
  });
}

export type PurchaseBalance = {
  /** iadeler düşülmüş alım tutarı, kuruş */
  total: number;
  /** tedarikçiye yapılan net ödeme, kuruş */
  paid: number;
  /** alımdan düşülen iade tutarı, kuruş */
  returned: number;
  /** total − paid; pozitif: hâlâ borçlusunuz, negatif: fazla ödeme */
  remaining: number;
};

export async function getPurchasePayments(purchaseId: string): Promise<Payment[]> {
  return db.payments
    .where("source_id")
    .equals(purchaseId)
    .filter((p) => p.source_type === "PURCHASE")
    .toArray();
}

/** Alımın kalan borcu: tutar − bu alıma bağlı net ödemeler. */
export async function getPurchaseBalance(purchaseId: string): Promise<PurchaseBalance> {
  const [purchase, payments, returns] = await Promise.all([
    db.purchases.get(purchaseId),
    getPurchasePayments(purchaseId),
    db.return_transactions
      .where("original_id")
      .equals(purchaseId)
      .filter((r) => r.original_type === "PURCHASE" && r.status === "POSTED")
      .toArray(),
  ]);
  const returned = returns.reduce((acc, r) => acc + toKurus(r.total_amount), 0);
  const total = toKurus(purchase?.total_amount ?? 0) - returned;
  const paid = payments.reduce((acc, p) => acc + (p.direction === "OUT" ? 1 : -1) * toKurus(p.amount), 0);
  return { total, paid, returned, remaining: total - paid };
}

export async function getPurchaseItems(purchaseId: string): Promise<PurchaseItem[]> {
  const items = await db.purchase_items.where("purchase_id").equals(purchaseId).toArray();
  return items.sort((a, b) => a.created_at.localeCompare(b.created_at));
}
