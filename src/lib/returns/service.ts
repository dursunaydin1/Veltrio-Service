import { db } from "@/lib/db";
import type { ReturnItem, ReturnTransaction, SaleItem } from "@/lib/db";
import { fromKurus, toKurus } from "@/lib/calc";
import { recordDocumentPayment, reversePayment } from "@/lib/finance/service";
import { nextDocumentNo } from "@/lib/numbering";
import { getSaleBalance, undoMachineSale, type SaleContext } from "@/lib/sales/service";
import { serialUnitPayload } from "@/lib/serial/service";
import { recordMovement } from "@/lib/stock/service";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

export class ReturnRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnRuleError";
  }
}

/** İade edilen ürünün stoğa durumu (§9.7). */
export type StockDisposition = ReturnItem["stock_disposition"];
/** Para iadesi: ödeme yöntemi veya müşteri alacağı (yalnızca müşterili satışta). */
export type RefundMethod = PaymentMethod | "CUSTOMER_CREDIT";

export type ReturnLineInput = {
  saleItemId: string;
  quantity: number;
  disposition: StockDisposition;
};

export type SaleReturnInput = {
  saleId: string;
  reason: string;
  refundMethod: RefundMethod;
  lines: ReturnLineInput[];
};

const RETURN_COLUMNS = [
  "document_no",
  "original_type",
  "original_id",
  "return_date",
  "reason",
  "refund_method",
  "total_amount",
  "status",
  "refund_payment_id",
  "reversal_reason",
  "created_by_device",
  "created_at",
] as const;
const RETURN_UPDATE_COLUMNS = RETURN_COLUMNS.filter((c) => !["document_no", "created_by_device", "created_at"].includes(c));

const ITEM_COLUMNS = [
  "return_id",
  "original_line_type",
  "original_line_id",
  "product_id",
  "serial_unit_id",
  "quantity",
  "unit",
  "amount",
  "stock_disposition",
  "stock_movement_id",
  "created_at",
] as const;

export function returnPayload(r: ReturnTransaction, update: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: r.id, business_id: r.business_id };
  for (const c of update ? RETURN_UPDATE_COLUMNS : RETURN_COLUMNS) payload[c] = r[c] ?? null;
  if (update) payload.version = r.version ?? 1;
  return payload;
}

export function itemPayload(i: ReturnItem): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: i.id, business_id: i.business_id };
  for (const c of ITEM_COLUMNS) payload[c] = i[c] ?? null;
  return payload;
}

export const scope = () =>
  [
    db.return_transactions,
    db.return_items,
    db.sales,
    db.sale_items,
    db.purchases,
    db.purchase_items,
    db.suppliers,
    db.customers,
    db.machines,
    db.machine_ownership_history,
    db.products,
    db.product_serial_units,
    db.stock_movements,
    db.payments,
    db.payment_allocations,
    db.services,
    db.counters,
    db.sync_queue,
    db.audit_logs,
  ] as const;

/** Bir satış satırının daha önce (geçerli iadelerde) iade edilen miktarı ve tutarı. */
export async function returnedSoFar(saleItemId: string): Promise<{ quantity: number; amountKurus: number }> {
  const items = await db.return_items.where("original_line_id").equals(saleItemId).toArray();
  let quantity = 0;
  let amountKurus = 0;
  for (const i of items) {
    const parent = await db.return_transactions.get(i.return_id);
    if (parent?.status !== "POSTED") continue;
    quantity = Math.round((quantity + i.quantity) * 10000) / 10000;
    amountKurus += toKurus(i.amount);
  }
  return { quantity, amountKurus };
}

/** Satırın iade edilebilir kalan miktarı (UI için). */
export async function getReturnableQuantity(item: SaleItem): Promise<number> {
  const done = await returnedSoFar(item.id);
  return Math.round((item.quantity - done.quantity) * 10000) / 10000;
}

/**
 * Müşteri ürün iadesi (§9.7, FR-018, AC-012). Orijinal satış satırına bağlıdır;
 * daha önce iade edilen miktar toplamı satılanı aşamaz. İade tutarı satır
 * tutarından orantılı hesaplanır. Stok: SELLABLE satılabilir stoğa, DAMAGED
 * hasarlı kovaya döner, NOT_RETURNED stoğa dokunmaz. Para: ödeme yöntemi seçilirse
 * satışa fazladan ödenmiş kısım kadar iade ödemesi (OUT) yazılır; kalan kısım
 * müşterinin borcunu azaltır. CUSTOMER_CREDIT ise ödeme yazılmaz, tutar müşteri
 * alacağı olarak bakiyede kalır. Aynı tutar iki kez sayılmaz.
 */
export async function createSaleReturn(ctx: SaleContext, input: SaleReturnInput): Promise<ReturnTransaction> {
  const why = input.reason.trim();
  if (!why) throw new ReturnRuleError("İade nedeni zorunludur.");
  if (input.lines.length === 0) throw new ReturnRuleError("İade edilecek en az bir kalem seçin.");

  return db.transaction("rw", [...scope()], async () => {
    const sale = await db.sales.get(input.saleId);
    if (!sale || sale.business_id !== ctx.businessId) throw new ReturnRuleError("Satış bulunamadı.");
    if (sale.status !== "FINAL") throw new ReturnRuleError("Yalnızca kesinleşmiş satış için iade alınır.");
    if (input.refundMethod === "CUSTOMER_CREDIT" && !sale.customer_id) {
      throw new ReturnRuleError("Müşterisiz satışta müşteri alacağı yazılamaz: ödeme yöntemi seçin.");
    }

    const returnId = generateId();
    const now = nowISO();
    const seen = new Set<string>();
    const items: ReturnItem[] = [];
    let totalKurus = 0;

    for (const line of input.lines) {
      if (seen.has(line.saleItemId)) throw new ReturnRuleError("Aynı kalem iki kez seçilemez.");
      seen.add(line.saleItemId);

      const saleItem = await db.sale_items.get(line.saleItemId);
      if (!saleItem || saleItem.sale_id !== sale.id) throw new ReturnRuleError("Satış kalemi bulunamadı.");
      if (!(line.quantity > 0)) throw new ReturnRuleError("İade miktarı sıfırdan büyük olmalıdır.");

      const done = await returnedSoFar(saleItem.id);
      const remaining = Math.round((saleItem.quantity - done.quantity) * 10000) / 10000;
      if (line.quantity > remaining + 1e-9) {
        throw new ReturnRuleError(
          `“${saleItem.description_snapshot}” için en fazla ${remaining} ${saleItem.unit} iade edilebilir (daha önce iade edilenler düşüldü).`
        );
      }
      if (saleItem.serial_unit_id && line.quantity !== 1) {
        throw new ReturnRuleError("Seri numaralı ürün birim birim iade edilir.");
      }

      const lineKurus = toKurus(saleItem.line_total);
      const isRest = Math.abs(line.quantity - remaining) < 1e-9;
      const amountKurus = isRest ? lineKurus - done.amountKurus : Math.round((lineKurus * line.quantity) / saleItem.quantity);
      totalKurus += amountKurus;

      let movementId: string | undefined;
      if (saleItem.product_id && line.disposition !== "NOT_RETURNED") {
        const movement = await recordMovement(ctx, {
          productId: saleItem.product_id,
          type: "RETURN_IN",
          bucket: line.disposition === "DAMAGED" ? "DAMAGED" : "AVAILABLE",
          quantity: line.quantity,
          unitCost: saleItem.unit_cost_snapshot,
          sourceType: "RETURN",
          sourceId: returnId,
          note: `İade (${sale.document_no}): ${why}`,
          serialUnitId: saleItem.serial_unit_id,
        });
        movementId = movement.id;
      }

      if (saleItem.serial_unit_id && line.disposition !== "NOT_RETURNED") {
        const unit = await db.product_serial_units.get(saleItem.serial_unit_id);
        if (!unit || unit.status !== "SOLD") throw new ReturnRuleError("Seri birim satılmış durumda değil.");
        const back = {
          ...unit,
          status: line.disposition === "DAMAGED" ? ("DAMAGED" as const) : ("IN_STOCK" as const),
          machine_id: undefined,
          sale_item_id: undefined,
          updated_at: now,
        };
        await db.product_serial_units.put(back);
        await enqueue("product_serial_units", unit.id, "UPDATE", serialUnitPayload(back, true), ctx.deviceCode);
        if (saleItem.machine_id) {
          await undoMachineSale(ctx, sale, saleItem.machine_id, `Satış iadesi (${sale.document_no}): ${why}`);
        }
      }

      items.push({
        id: generateId(),
        business_id: ctx.businessId,
        return_id: returnId,
        original_line_type: "SALE_ITEM",
        original_line_id: saleItem.id,
        product_id: saleItem.product_id,
        serial_unit_id: saleItem.serial_unit_id,
        quantity: line.quantity,
        unit: saleItem.unit,
        amount: fromKurus(amountKurus),
        stock_disposition: line.disposition,
        stock_movement_id: movementId,
        created_at: now,
      });
    }

    // Para iadesi: yalnızca satışa fazladan ödenmiş kısım nakden çıkar; gerisi borcu düşürür.
    const before = await getSaleBalance(sale.id);
    const newTotal = before.total - totalKurus;
    const overpaid = Math.max(0, before.paid - newTotal);
    const refundKurus = input.refundMethod === "CUSTOMER_CREDIT" ? 0 : Math.min(totalKurus, overpaid);

    let refundPaymentId: string | undefined;
    if (refundKurus > 0) {
      const payment = await recordDocumentPayment(ctx, {
        customerId: sale.customer_id,
        direction: "OUT",
        method: input.refundMethod as PaymentMethod,
        amountKurus: refundKurus,
        note: `Satış iadesi (${sale.document_no})`,
        sourceType: "SALE",
        sourceId: sale.id,
      });
      refundPaymentId = payment.id;
    }

    const record: ReturnTransaction = {
      id: returnId,
      business_id: ctx.businessId,
      document_no: await nextDocumentNo("return", ctx.deviceCode),
      original_type: "SALE",
      original_id: sale.id,
      return_date: now,
      reason: why,
      refund_method: input.refundMethod,
      total_amount: fromKurus(totalKurus),
      status: "POSTED",
      refund_payment_id: refundPaymentId,
      created_by_device: ctx.deviceCode,
      created_at: now,
    };
    await db.return_transactions.add(record);
    await enqueue("return_transactions", record.id, "INSERT", returnPayload(record, false), ctx.deviceCode);
    for (const item of items) {
      await db.return_items.add(item);
      await enqueue("return_items", item.id, "INSERT", itemPayload(item), ctx.deviceCode);
    }
    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "return_transactions",
      entityId: record.id,
      action: "CREATE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason: why,
      newValue: { sale_id: sale.id, total_amount: record.total_amount, refund_method: record.refund_method },
    });
    return record;
  });
}

/**
 * İadeyi geri alır (hatalı iade): kayıt silinmez, REVERSED olur; stok girişi
 * ters hareketle çıkarılır, para iadesi ters ödemeyle geri alınır. Seri numaralı
 * (makine) iadesi geri alınamaz; satış yeniden yapılır.
 */
export async function reverseReturn(ctx: SaleContext, returnId: string, reason: string): Promise<ReturnTransaction> {
  const why = reason.trim();
  if (!why) throw new ReturnRuleError("Geri alma nedeni zorunludur.");

  return db.transaction("rw", [...scope()], async () => {
    const record = await db.return_transactions.get(returnId);
    if (!record || record.business_id !== ctx.businessId) throw new ReturnRuleError("İade bulunamadı.");
    if (record.status !== "POSTED") throw new ReturnRuleError("Bu iade zaten geri alınmış.");

    const items = await db.return_items.where("return_id").equals(returnId).toArray();
    if (items.some((i) => i.serial_unit_id && i.stock_disposition !== "NOT_RETURNED")) {
      throw new ReturnRuleError("Seri numaralı ürünün iadesi geri alınamaz.");
    }

    for (const item of items) {
      const original = item.stock_movement_id ? await db.stock_movements.get(item.stock_movement_id) : undefined;
      if (!original) continue;
      await recordMovement(ctx, {
        productId: original.product_id,
        type: "CANCEL_REVERSAL",
        bucket: original.bucket,
        quantity: -original.quantity,
        unitCost: original.unit_cost,
        sourceType: "RETURN",
        sourceId: returnId,
        note: `İade geri alındı (${record.document_no}): ${why}`,
        reversalOfId: original.id,
      });
    }
    if (record.refund_payment_id) {
      await reversePayment(ctx, record.refund_payment_id, `İade geri alındı (${record.document_no}): ${why}`);
    }

    const next: ReturnTransaction = { ...record, status: "REVERSED", reversal_reason: why };
    await db.return_transactions.put(next);
    await enqueue("return_transactions", returnId, "UPDATE", returnPayload(next, true), ctx.deviceCode);
    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "return_transactions",
      entityId: returnId,
      action: "STATE_CHANGE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason: why,
      oldValue: { status: "POSTED" },
      newValue: { status: "REVERSED" },
    });
    return next;
  });
}

export async function getSaleReturns(saleId: string): Promise<ReturnTransaction[]> {
  const rows = await db.return_transactions
    .where("original_id")
    .equals(saleId)
    .filter((r) => r.original_type === "SALE")
    .toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getReturnItems(returnId: string): Promise<ReturnItem[]> {
  return db.return_items.where("return_id").equals(returnId).toArray();
}

/** Satış iadesini geri alır (bkz. `reverseReturn`). */
export const reverseSaleReturn = reverseReturn;
