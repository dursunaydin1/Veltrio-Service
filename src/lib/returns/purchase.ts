import { db } from "@/lib/db";
import type { PurchaseItem, ReturnItem, ReturnTransaction } from "@/lib/db";
import { fromKurus, toKurus } from "@/lib/calc";
import { recordSupplierPayment } from "@/lib/finance/service";
import { nextDocumentNo } from "@/lib/numbering";
import { getPurchaseBalance } from "@/lib/purchases/service";
import { serialUnitPayload } from "@/lib/serial/service";
import { recordMovement } from "@/lib/stock/service";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { PaymentMethod, StockBucket } from "@/types";
import { ReturnRuleError, itemPayload, returnPayload, returnedSoFar, scope } from "./service";

/** Tedarikçiden para iadesi: ödeme yöntemi veya tedarikçi bakiyesinden düşme. */
export type SupplierRefundMethod = PaymentMethod | "SUPPLIER_CREDIT";

export type PurchaseReturnLineInput = {
  purchaseItemId: string;
  /** Seri takipsiz ürün için miktar; seri takipli ürün için `serialUnitIds` uzunluğu kullanılır */
  quantity?: number;
  /** Stok çıkışının yapılacağı kova: satılabilir veya hasarlı stok */
  bucket: StockBucket;
  /** Seri takipli ürün: iade edilecek birimler */
  serialUnitIds?: string[];
};

export type PurchaseReturnInput = {
  purchaseId: string;
  reason: string;
  refundMethod: SupplierRefundMethod;
  lines: PurchaseReturnLineInput[];
};

/** Satırın iade edilebilir kalan miktarı (UI için). */
export async function getReturnablePurchaseQuantity(item: PurchaseItem): Promise<number> {
  const done = await returnedSoFar(item.id);
  return Math.round((item.quantity - done.quantity) * 10000) / 10000;
}

/**
 * Tedarikçiye iade (§9.7, AC-013). Teslim alınmış alımın satırına bağlıdır;
 * iade edilen miktar toplamı alınanı aşamaz. Stok RETURN_OUT hareketiyle seçilen
 * kovadan (satılabilir/hasarlı) çıkar; yeterli stok yoksa işlem reddedilir. Seri
 * takipli üründe birimler tek tek seçilir ve `RETURNED_TO_SUPPLIER` olur. Tutar
 * satır tutarından orantılı hesaplanır ve tedarikçiye borcu düşürür; ödeme
 * yöntemi seçilirse yalnızca alıma fazladan ödenmiş kısım tedarikçiden geri
 * alınmış (IN) sayılır, gerisi borçtan düşer.
 */
export async function createPurchaseReturn(ctx: BusinessContext, input: PurchaseReturnInput): Promise<ReturnTransaction> {
  const why = input.reason.trim();
  if (!why) throw new ReturnRuleError("İade nedeni zorunludur.");
  if (input.lines.length === 0) throw new ReturnRuleError("İade edilecek en az bir kalem seçin.");

  return db.transaction("rw", [...scope()], async () => {
    const purchase = await db.purchases.get(input.purchaseId);
    if (!purchase || purchase.business_id !== ctx.businessId) throw new ReturnRuleError("Alım bulunamadı.");
    if (purchase.status !== "RECEIVED") throw new ReturnRuleError("Yalnızca teslim alınmış alım için iade yapılır.");
    if (!purchase.supplier_id) throw new ReturnRuleError("Tedarikçisiz alımda iade yapılamaz: alıma tedarikçi ekleyin.");

    const returnId = generateId();
    const now = nowISO();
    const seen = new Set<string>();
    const items: ReturnItem[] = [];
    let totalKurus = 0;

    for (const line of input.lines) {
      if (seen.has(line.purchaseItemId)) throw new ReturnRuleError("Aynı kalem iki kez seçilemez.");
      seen.add(line.purchaseItemId);

      const item = await db.purchase_items.get(line.purchaseItemId);
      if (!item || item.purchase_id !== purchase.id) throw new ReturnRuleError("Alım kalemi bulunamadı.");
      const product = item.product_id ? await db.products.get(item.product_id) : undefined;
      const serial = !!product?.is_serial_tracked;

      const unitIds = serial ? [...new Set(line.serialUnitIds ?? [])] : [];
      const quantity = serial ? unitIds.length : (line.quantity ?? 0);
      if (!(quantity > 0)) throw new ReturnRuleError(serial ? "İade edilecek birimi seçin." : "İade miktarı sıfırdan büyük olmalıdır.");

      const done = await returnedSoFar(item.id);
      const remaining = Math.round((item.quantity - done.quantity) * 10000) / 10000;
      if (quantity > remaining + 1e-9) {
        throw new ReturnRuleError(
          `“${item.description_snapshot}” için en fazla ${remaining} ${item.unit} iade edilebilir (daha önce iade edilenler düşüldü).`
        );
      }

      const lineKurus = toKurus(item.line_total);
      const unitCost = lineKurus / 100 / item.quantity;
      // Tutar: tam kalan iade ediliyorsa kuruş farkı bırakmamak için kalan tutarın tamamı.
      const amountFor = (qty: number, alreadyKurus: number, restLeft: boolean) =>
        restLeft ? lineKurus - alreadyKurus : Math.round((lineKurus * qty) / item.quantity);

      if (serial) {
        let acc = done.amountKurus;
        let left = remaining;
        for (const unitId of unitIds) {
          const unit = await db.product_serial_units.get(unitId);
          if (!unit || unit.product_id !== item.product_id || unit.purchase_item_id !== item.id) {
            throw new ReturnRuleError("Seçilen birim bu alım kaleminden değil.");
          }
          const expected = line.bucket === "DAMAGED" ? "DAMAGED" : "IN_STOCK";
          if (unit.status !== expected) {
            throw new ReturnRuleError(`“${unit.serial_number ?? unit.internal_number ?? unitId}” birimi ${line.bucket === "DAMAGED" ? "hasarlı stokta" : "stokta"} değil.`);
          }
          const amountKurus = amountFor(1, acc, left === 1);
          acc += amountKurus;
          left -= 1;
          totalKurus += amountKurus;

          const movement = await recordMovement(ctx, {
            productId: unit.product_id,
            type: "RETURN_OUT",
            bucket: line.bucket,
            quantity: -1,
            unitCost,
            sourceType: "RETURN",
            sourceId: returnId,
            note: `Tedarikçiye iade (${purchase.document_no}): ${why}`,
            serialUnitId: unit.id,
          });
          const out = { ...unit, status: "RETURNED_TO_SUPPLIER" as const, updated_at: now };
          await db.product_serial_units.put(out);
          await enqueue("product_serial_units", unit.id, "UPDATE", serialUnitPayload(out, true), ctx.deviceCode);
          items.push({
            id: generateId(),
            business_id: ctx.businessId,
            return_id: returnId,
            original_line_type: "PURCHASE_ITEM",
            original_line_id: item.id,
            product_id: item.product_id,
            serial_unit_id: unit.id,
            quantity: 1,
            unit: item.unit,
            amount: fromKurus(amountKurus),
            stock_disposition: line.bucket === "DAMAGED" ? "DAMAGED" : "SELLABLE",
            stock_movement_id: movement.id,
            created_at: now,
          });
        }
        continue;
      }

      const isRest = Math.abs(quantity - remaining) < 1e-9;
      const amountKurus = amountFor(quantity, done.amountKurus, isRest);
      totalKurus += amountKurus;
      let movementId: string | undefined;
      if (item.product_id) {
        const movement = await recordMovement(ctx, {
          productId: item.product_id,
          type: "RETURN_OUT",
          bucket: line.bucket,
          quantity: -quantity,
          unitCost,
          sourceType: "RETURN",
          sourceId: returnId,
          note: `Tedarikçiye iade (${purchase.document_no}): ${why}`,
        });
        movementId = movement.id;
      }
      items.push({
        id: generateId(),
        business_id: ctx.businessId,
        return_id: returnId,
        original_line_type: "PURCHASE_ITEM",
        original_line_id: item.id,
        product_id: item.product_id,
        quantity,
        unit: item.unit,
        amount: fromKurus(amountKurus),
        stock_disposition: line.bucket === "DAMAGED" ? "DAMAGED" : "SELLABLE",
        stock_movement_id: movementId,
        created_at: now,
      });
    }

    // Para: alıma fazladan ödenmiş kısım tedarikçiden geri alınır; gerisi borcu düşürür.
    const before = await getPurchaseBalance(purchase.id);
    const overpaid = Math.max(0, before.paid - (before.total - totalKurus));
    const refundKurus = input.refundMethod === "SUPPLIER_CREDIT" ? 0 : Math.min(totalKurus, overpaid);
    let refundPaymentId: string | undefined;
    if (refundKurus > 0) {
      const payment = await recordSupplierPayment(ctx, {
        supplierId: purchase.supplier_id,
        direction: "IN",
        method: input.refundMethod as PaymentMethod,
        amountKurus: refundKurus,
        note: `Alım iadesi (${purchase.document_no})`,
        sourceType: "PURCHASE",
        sourceId: purchase.id,
      });
      refundPaymentId = payment.id;
    }

    const record: ReturnTransaction = {
      id: returnId,
      business_id: ctx.businessId,
      document_no: await nextDocumentNo("return", ctx.deviceCode),
      original_type: "PURCHASE",
      original_id: purchase.id,
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
      newValue: { purchase_id: purchase.id, total_amount: record.total_amount, refund_method: record.refund_method },
    });
    return record;
  });
}

export async function getPurchaseReturns(purchaseId: string): Promise<ReturnTransaction[]> {
  const rows = await db.return_transactions
    .where("original_id")
    .equals(purchaseId)
    .filter((r) => r.original_type === "PURCHASE")
    .toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
