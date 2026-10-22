import { db } from "@/lib/db";
import { fromKurus } from "@/lib/calc";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { OpeningBalance } from "@/lib/db";
import type { Payment, PaymentDirection, PaymentMethod } from "@/types";
import { calcCustomerBalance, type BalanceBreakdown } from "./balance";

export class FinanceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceRuleError";
  }
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Nakit",
  CARD: "Kart",
  BANK_TRANSFER: "Havale / EFT",
  OTHER: "Diğer",
};

const PAYMENT_COLUMNS = [
  "direction",
  "method",
  "amount",
  "payment_date",
  "customer_id",
  "supplier_id",
  "source_type",
  "source_id",
  "note",
  "status",
  "reversal_of_id",
  "created_by_device",
  "created_at",
] as const;

function paymentPayload(payment: Payment): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: payment.id, business_id: payment.business_id };
  for (const column of PAYMENT_COLUMNS) payload[column] = payment[column] ?? null;
  return payload;
}

/** Müşteriden tahsilat (IN) veya müşteriye ödeme / iade (OUT) kaydeder. */
export async function recordCustomerPayment(
  ctx: BusinessContext,
  params: {
    customerId: string;
    direction: PaymentDirection;
    method: PaymentMethod;
    /** kuruş */
    amountKurus: number;
    note?: string;
    /** Ödemenin bağlı olduğu belge (ör. servis kaparosu) */
    sourceType?: string;
    sourceId?: string;
  }
): Promise<Payment> {
  if (!Number.isInteger(params.amountKurus) || params.amountKurus <= 0) {
    throw new FinanceRuleError("Tutar sıfırdan büyük olmalıdır.");
  }

  return db.transaction("rw", db.customers, db.payments, db.sync_queue, async () => {
    const customer = await db.customers.get(params.customerId);
    if (!customer || customer.business_id !== ctx.businessId) {
      throw new FinanceRuleError("Müşteri bulunamadı.");
    }

    const now = nowISO();
    const payment: Payment = {
      id: generateId(),
      business_id: ctx.businessId,
      direction: params.direction,
      method: params.method,
      amount: fromKurus(params.amountKurus),
      payment_date: now,
      customer_id: params.customerId,
      source_type: params.sourceType,
      source_id: params.sourceId,
      note: params.note?.trim() || undefined,
      status: "VALID",
      created_by_device: ctx.deviceCode,
      created_at: now,
    };
    await db.payments.add(payment);
    await enqueue("payments", payment.id, "INSERT", paymentPayload(payment), ctx.deviceCode);
    return payment;
  });
}

/**
 * Hatalı ödemeyi silmez, karşı yönlü yeni bir kayıtla düzeltir (§9.4).
 * Orijinal ödemeye bağlı tahsisler de aynı tutarla ters çevrilir. Bir ödeme
 * yalnızca bir kez ters kaydedilebilir. Neden zorunludur ve audit log'a yazılır.
 */
export async function reversePayment(
  ctx: BusinessContext,
  paymentId: string,
  reason: string
): Promise<Payment> {
  const why = reason.trim();
  if (!why) throw new FinanceRuleError("Ters kayıt nedeni zorunludur.");

  return db.transaction(
    "rw",
    [db.payments, db.payment_allocations, db.sync_queue, db.audit_logs],
    async () => {
      const original = await db.payments.get(paymentId);
      if (!original || original.business_id !== ctx.businessId) {
        throw new FinanceRuleError("Ödeme bulunamadı.");
      }
      if (original.reversal_of_id) {
        throw new FinanceRuleError("Bir ters kayıt tekrar ters kaydedilemez.");
      }
      const already = await db.payments.filter((p) => p.reversal_of_id === paymentId).first();
      if (already) throw new FinanceRuleError("Bu ödeme zaten ters kaydedilmiş.");

      const now = nowISO();
      const reversal: Payment = {
        id: generateId(),
        business_id: ctx.businessId,
        direction: original.direction === "IN" ? "OUT" : "IN",
        method: original.method,
        amount: original.amount,
        payment_date: now,
        customer_id: original.customer_id,
        supplier_id: original.supplier_id,
        source_type: original.source_type,
        source_id: original.source_id,
        note: `Ters kayıt: ${why}`,
        status: "REVERSED",
        reversal_of_id: original.id,
        created_by_device: ctx.deviceCode,
        created_at: now,
      };
      await db.payments.add(reversal);
      await enqueue("payments", reversal.id, "INSERT", paymentPayload(reversal), ctx.deviceCode);

      const allocations = await db.payment_allocations.where("payment_id").equals(original.id).toArray();
      for (const a of allocations) {
        const copy = {
          id: generateId(),
          business_id: ctx.businessId,
          payment_id: reversal.id,
          source_type: a.source_type,
          source_id: a.source_id,
          allocated_amount: a.allocated_amount,
          created_at: now,
        };
        await db.payment_allocations.add(copy);
        await enqueue("payment_allocations", copy.id, "INSERT", copy, ctx.deviceCode);
      }

      await writeAuditLog({
        businessId: ctx.businessId,
        entityType: "payments",
        entityId: original.id,
        action: "STATE_CHANGE",
        deviceCode: ctx.deviceCode,
        actorId: ctx.actorId,
        reason: why,
        oldValue: { amount: original.amount, direction: original.direction },
        newValue: { reversal_id: reversal.id },
      });
      return reversal;
    }
  );
}

/** Ters kaydedilmiş (iptal edilmiş) orijinal ödemelerin kimlikleri. */
export function reversedPaymentIds(payments: Payment[]): Set<string> {
  return new Set(payments.filter((p) => p.reversal_of_id).map((p) => p.reversal_of_id as string));
}

type OpeningBalanceRecord = OpeningBalance & { version?: number };

/**
 * Müşterinin açılış bakiyesini ekler veya değiştirir. Sahte satış/ödeme
 * üretilmez (§9.4). Değişiklik kritik işlemdir: mevcut kayıt değiştirilirken
 * neden zorunludur ve audit log'a eski/yeni değer yazılır.
 */
export async function setCustomerOpeningBalance(
  ctx: BusinessContext,
  params: {
    customerId: string;
    direction: OpeningBalance["direction"];
    /** kuruş */
    amountKurus: number;
    asOfDate: string;
    note?: string;
    reason?: string;
  }
): Promise<OpeningBalance> {
  if (!Number.isInteger(params.amountKurus) || params.amountKurus < 0) {
    throw new FinanceRuleError("Tutar sıfır veya daha büyük olmalıdır.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.asOfDate)) {
    throw new FinanceRuleError("Tarih geçersiz.");
  }

  return db.transaction(
    "rw",
    [db.customers, db.opening_balances, db.sync_queue, db.audit_logs],
    async () => {
      const customer = await db.customers.get(params.customerId);
      if (!customer || customer.business_id !== ctx.businessId) {
        throw new FinanceRuleError("Müşteri bulunamadı.");
      }

      const existing = (await db.opening_balances
        .where("party_id")
        .equals(params.customerId)
        .filter((o) => o.party_type === "CUSTOMER" && o.business_id === ctx.businessId)
        .first()) as OpeningBalanceRecord | undefined;

      const fields = {
        direction: params.direction,
        amount: fromKurus(params.amountKurus),
        as_of_date: params.asOfDate,
        source_note: params.note?.trim() || undefined,
      };

      if (!existing) {
        const created: OpeningBalance = {
          id: generateId(),
          business_id: ctx.businessId,
          party_type: "CUSTOMER",
          party_id: params.customerId,
          created_at: nowISO(),
          ...fields,
        };
        await db.opening_balances.add(created);
        await enqueue(
          "opening_balances",
          created.id,
          "INSERT",
          {
            id: created.id,
            business_id: created.business_id,
            party_type: created.party_type,
            party_id: created.party_id,
            direction: created.direction,
            amount: created.amount,
            as_of_date: created.as_of_date,
            source_note: created.source_note ?? null,
            created_at: created.created_at,
          },
          ctx.deviceCode
        );
        await writeAuditLog({
          businessId: ctx.businessId,
          entityType: "opening_balances",
          entityId: created.id,
          action: "CREATE",
          deviceCode: ctx.deviceCode,
          actorId: ctx.actorId,
          reason: params.reason?.trim() || undefined,
          newValue: { ...fields, party_id: params.customerId },
        });
        return created;
      }

      const reason = params.reason?.trim();
      if (!reason) throw new FinanceRuleError("Açılış bakiyesini değiştirirken neden zorunludur.");

      const next: OpeningBalanceRecord = { ...existing, ...fields };
      await db.opening_balances.put(next);
      await enqueue(
        "opening_balances",
        next.id,
        "UPDATE",
        {
          id: next.id,
          business_id: next.business_id,
          direction: next.direction,
          amount: next.amount,
          as_of_date: next.as_of_date,
          source_note: next.source_note ?? null,
          version: existing.version ?? 1,
        },
        ctx.deviceCode
      );
      await writeAuditLog({
        businessId: ctx.businessId,
        entityType: "opening_balances",
        entityId: next.id,
        action: "UPDATE",
        deviceCode: ctx.deviceCode,
        actorId: ctx.actorId,
        reason,
        oldValue: { direction: existing.direction, amount: existing.amount, as_of_date: existing.as_of_date },
        newValue: { direction: next.direction, amount: next.amount, as_of_date: next.as_of_date },
      });
      return next;
    }
  );
}

/** Müşteri bakiyesini belgelerden hesaplar (saklanan bir değere güvenmez). */
export async function getCustomerBalance(
  businessId: string,
  customerId: string
): Promise<BalanceBreakdown> {
  const [openingBalances, payments, sales, services] = await Promise.all([
    db.opening_balances
      .where("party_id")
      .equals(customerId)
      .filter((o) => o.party_type === "CUSTOMER" && o.business_id === businessId)
      .toArray(),
    db.payments
      .where("customer_id")
      .equals(customerId)
      .filter((p) => p.business_id === businessId)
      .toArray(),
    db.sales
      .where("customer_id")
      .equals(customerId)
      .filter((s) => s.business_id === businessId && s.status === "FINAL")
      .toArray(),
    db.services
      .where("customer_id")
      .equals(customerId)
      .filter((s) => s.business_id === businessId && !!s.first_completed_at && s.status !== "CANCELLED")
      .toArray(),
  ]);

  return calcCustomerBalance({
    openingBalances,
    charges: [...sales.map((s) => s.total_amount), ...services.map((s) => s.total_amount)],
    payments,
    // İadeler (Faz 5) eklendiğinde buradan beslenecek.
    returns: [],
  });
}
