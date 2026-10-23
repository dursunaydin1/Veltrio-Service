import { db } from "@/lib/db";
import type { ReturnItem, ReturnTransaction } from "@/lib/db";
import { fromKurus, toKurus } from "@/lib/calc";
import { recordCustomerPayment } from "@/lib/finance/service";
import { nextDocumentNo } from "@/lib/numbering";
import { isBilled } from "@/lib/services/lines";
import { getServiceBalance, type ServiceContext } from "@/lib/services/service";
import { recordMovement } from "@/lib/stock/service";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { Payment, PaymentMethod } from "@/types";
import {
  ReturnRuleError,
  itemPayload,
  returnPayload,
  returnedSoFar,
  scope,
  type RefundMethod,
  type StockDisposition,
} from "./service";

export type ServiceReturnLineInput = {
  servicePartId: string;
  quantity: number;
  /** Stoktan kullanılan parça geri geliyorsa stok durumu; stok dışı parçada yok sayılır */
  disposition: StockDisposition;
};

export type ServiceReturnInput = {
  serviceId: string;
  reason: string;
  refundMethod: RefundMethod;
  /** Parça iadeleri (isteğe bağlı) */
  lines?: ServiceReturnLineInput[];
  /** Parçaya bağlı olmayan ücret düzeltmesi, kuruş (işçilik indirimi vb.) */
  extraAmountKurus?: number;
};

/** Parçanın iade edilebilir kalan miktarı: kullanılan (yoksa alınan) miktar − daha önce iade edilen. */
export async function getReturnablePartQuantity(partId: string): Promise<number> {
  const part = await db.service_parts.get(partId);
  if (!part || !isBilled(part.status)) return 0;
  const base = part.source_type === "STOCK_PRODUCT" ? part.used_quantity : part.quantity;
  const done = await returnedSoFar(partId);
  return Math.max(0, Math.round((base - done.quantity) * 10000) / 10000);
}

/**
 * Teslim sonrası servis ücret iadesi / düzeltmesi (§5.2, SR-017, AC-014).
 * Teslim edilmiş servis iptal edilemez; hata ReturnTransaction (original_type =
 * SERVICE) ile düzeltilir: iade edilecek parçalar (stok durumuyla) ve/veya
 * parçaya bağlı olmayan tutar belirtilir. Para kuralı satış iadesiyle aynıdır:
 * tutar önce müşterinin borcunu düşürür, yalnızca fazla ödenen kısım için ödeme
 * (OUT) yazılır; CUSTOMER_CREDIT'te ödeme yazılmaz.
 */
export async function createServiceReturn(ctx: ServiceContext, input: ServiceReturnInput): Promise<ReturnTransaction> {
  const why = input.reason.trim();
  if (!why) throw new ReturnRuleError("İade nedeni zorunludur.");
  const lines = input.lines ?? [];
  const extra = input.extraAmountKurus ?? 0;
  if (!Number.isInteger(extra) || extra < 0) throw new ReturnRuleError("Düzeltme tutarı geçersiz.");
  if (lines.length === 0 && extra === 0) throw new ReturnRuleError("İade edilecek parça veya tutar girin.");

  return db.transaction("rw", [...scope(), db.service_parts], async () => {
    const service = await db.services.get(input.serviceId);
    if (!service || service.business_id !== ctx.businessId) throw new ReturnRuleError("Servis bulunamadı.");
    if (service.status !== "DELIVERED") {
      throw new ReturnRuleError("Ücret iadesi yalnızca teslim edilmiş servis için yapılır; teslim öncesi iptal edilir.");
    }
    if (!service.customer_id) throw new ReturnRuleError("Serviste müşteri bilgisi yok.");

    const returnId = generateId();
    const now = nowISO();
    const seen = new Set<string>();
    const items: ReturnItem[] = [];
    let totalKurus = extra;

    for (const line of lines) {
      if (seen.has(line.servicePartId)) throw new ReturnRuleError("Aynı parça iki kez seçilemez.");
      seen.add(line.servicePartId);
      const part = await db.service_parts.get(line.servicePartId);
      if (!part || part.service_id !== service.id) throw new ReturnRuleError("Servis parçası bulunamadı.");
      if (!(line.quantity > 0)) throw new ReturnRuleError("İade miktarı sıfırdan büyük olmalıdır.");

      const remaining = await getReturnablePartQuantity(part.id);
      if (line.quantity > remaining + 1e-9) {
        throw new ReturnRuleError(
          `“${part.description_snapshot}” için en fazla ${remaining} ${part.unit} iade edilebilir (daha önce iade edilenler düşüldü).`
        );
      }
      const done = await returnedSoFar(part.id);
      const base = part.source_type === "STOCK_PRODUCT" ? part.used_quantity : part.quantity;
      const lineKurus = toKurus(part.line_total);
      // Faturalanan tutar, faturalanan miktar (quantity) üzerinden orantılanır.
      const isRest = Math.abs(line.quantity - remaining) < 1e-9 && base === part.quantity;
      const amountKurus = isRest ? lineKurus - done.amountKurus : Math.round((lineKurus * line.quantity) / part.quantity);
      totalKurus += amountKurus;

      const toStock = part.source_type === "STOCK_PRODUCT" && !!part.product_id && line.disposition !== "NOT_RETURNED";
      let movementId: string | undefined;
      if (toStock) {
        const movement = await recordMovement(ctx, {
          productId: part.product_id as string,
          type: "RETURN_IN",
          bucket: line.disposition === "DAMAGED" ? "DAMAGED" : "AVAILABLE",
          quantity: line.quantity,
          unitCost: part.unit_cost_snapshot,
          sourceType: "RETURN",
          sourceId: returnId,
          note: `Servis iadesi (${service.document_no}): ${why}`,
        });
        movementId = movement.id;
      }
      items.push({
        id: generateId(),
        business_id: ctx.businessId,
        return_id: returnId,
        original_line_type: "SERVICE_PART",
        original_line_id: part.id,
        product_id: part.product_id,
        quantity: line.quantity,
        unit: part.unit,
        amount: fromKurus(amountKurus),
        stock_disposition: toStock ? line.disposition : "NOT_RETURNED",
        stock_movement_id: movementId,
        created_at: now,
      });
    }

    const before = await getServiceBalance(service.id);
    if (totalKurus > before.total) {
      throw new ReturnRuleError("İade tutarı servisin kalan tutarını aşamaz.");
    }
    const overpaid = Math.max(0, before.paid - (before.total - totalKurus));
    const refundKurus = input.refundMethod === "CUSTOMER_CREDIT" ? 0 : Math.min(totalKurus, overpaid);
    let refundPaymentId: string | undefined;
    if (refundKurus > 0) {
      const payment = await recordCustomerPayment(ctx, {
        customerId: service.customer_id,
        direction: "OUT",
        method: input.refundMethod as PaymentMethod,
        amountKurus: refundKurus,
        note: `Servis iadesi (${service.document_no})`,
        sourceType: "SERVICE",
        sourceId: service.id,
      });
      refundPaymentId = payment.id;
    }

    const record: ReturnTransaction = {
      id: returnId,
      business_id: ctx.businessId,
      document_no: await nextDocumentNo("return", ctx.deviceCode),
      original_type: "SERVICE",
      original_id: service.id,
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
      newValue: { service_id: service.id, total_amount: record.total_amount, refund_method: record.refund_method },
    });
    return record;
  });
}

/**
 * İptal edilmiş serviste alınmış kaporayı / ödemeyi müşteriye iade eder (SR-017).
 * İptal edilen servis müşteriye yazılmadığından alınan para fazla ödemedir; iade
 * edilmezse müşterinin alacağı olarak bakiyede kalır. İade, ters finans hareketi
 * olarak servise bağlı OUT ödemesidir; iade edilebilecek tutarı aşamaz.
 * Kullanılmış parçanın stoğu otomatik geri eklenmez (stok düzeltmesiyle yapılır).
 */
export async function refundCancelledServicePayment(
  ctx: ServiceContext,
  serviceId: string,
  params: { amountKurus: number; method: PaymentMethod; note?: string }
): Promise<Payment> {
  return db.transaction("rw", [db.services, db.customers, db.payments, db.return_transactions, db.sync_queue, db.audit_logs], async () => {
    const service = await db.services.get(serviceId);
    if (!service || service.business_id !== ctx.businessId) throw new ReturnRuleError("Servis bulunamadı.");
    if (service.status !== "CANCELLED") throw new ReturnRuleError("Kapora iadesi yalnızca iptal edilmiş servis için yapılır.");
    if (!service.customer_id) throw new ReturnRuleError("Serviste müşteri bilgisi yok.");
    if (!Number.isInteger(params.amountKurus) || params.amountKurus <= 0) {
      throw new ReturnRuleError("İade tutarı sıfırdan büyük olmalıdır.");
    }
    const { paid } = await getServiceBalance(serviceId);
    if (params.amountKurus > paid) {
      throw new ReturnRuleError(`İade edilebilecek en fazla tutar ${fromKurus(Math.max(paid, 0)).toFixed(2).replace(".", ",")} ₺.`);
    }
    const payment = await recordCustomerPayment(ctx, {
      customerId: service.customer_id,
      direction: "OUT",
      method: params.method,
      amountKurus: params.amountKurus,
      note: params.note?.trim() || `Kapora iadesi (${service.document_no})`,
      sourceType: "SERVICE",
      sourceId: serviceId,
    });
    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "services",
      entityId: serviceId,
      action: "UPDATE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason: "Kapora iadesi",
      newValue: { refunded_kurus: params.amountKurus, payment_id: payment.id },
    });
    return payment;
  });
}

export async function getServiceReturns(serviceId: string): Promise<ReturnTransaction[]> {
  const rows = await db.return_transactions
    .where("original_id")
    .equals(serviceId)
    .filter((r) => r.original_type === "SERVICE")
    .toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
