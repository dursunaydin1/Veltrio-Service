import { db } from "@/lib/db";
import { fromKurus, toKurus } from "@/lib/calc";
import { getSaleBalance } from "@/lib/sales/service";
import { getServiceBalance } from "@/lib/services/service";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO, todayLocalDate } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { PaymentMethod } from "@/types";
import { AGING_BANDS, ageItems, type AgingBandId } from "./aging";
import { getAllocatedKurus, type AllocationSource } from "./allocated";
import { FinanceRuleError, getCustomerBalance, recordPartyPayment } from "./service";

export type OpenItem = {
  /** `${kind}:${id}` */
  key: string;
  kind: AllocationSource;
  id: string;
  label: string;
  /** Belge tarihi (ISO) */
  docDate: string;
  /** Vade tarihi (YYYY-MM-DD), yoksa belge tarihi: yaşlandırma ve sıralama buna göre */
  refDate: string;
  dueDate?: string;
  totalKurus: number;
  paidKurus: number;
  remainingKurus: number;
};

export type CustomerOpenItems = {
  items: OpenItem[];
  /** Açık kalemlerin toplamı (brüt borç), kuruş */
  openKurus: number;
  /** Net bakiye (pozitif: müşteri borçlu), kuruş */
  balanceKurus: number;
  /** Müşteri alacağı (avans, iade, fazla ödeme), kuruş: brüt borç − net bakiye, en az 0 */
  creditKurus: number;
  aging: Record<AgingBandId, number>;
};

export const openItemKey = (kind: AllocationSource, id: string) => `${kind}:${id}`;

/**
 * Müşterinin açık kalemleri (§9.4): açılış bakiyesi borcu, kesinleşmiş satışlar
 * ve ücretli servisler — her biri iade ve tahsisler düşülmüş kalanla. Kalan
 * pozitifse listelenir; alacaklar ayrı (`creditKurus`) gösterilir (AC-046).
 */
export async function getCustomerOpenItems(businessId: string, customerId: string): Promise<CustomerOpenItems> {
  const [openings, sales, services, balance] = await Promise.all([
    db.opening_balances
      .where("party_id")
      .equals(customerId)
      .filter((o) => o.party_type === "CUSTOMER" && o.business_id === businessId && o.direction === "OWED_BY_PARTY")
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
    getCustomerBalance(businessId, customerId),
  ]);

  const items: OpenItem[] = [];
  const push = (item: Omit<OpenItem, "key" | "refDate"> & { refDate?: string }) => {
    if (item.remainingKurus <= 0) return;
    items.push({ ...item, key: openItemKey(item.kind, item.id), refDate: item.refDate ?? item.dueDate ?? item.docDate });
  };

  for (const o of openings) {
    const total = toKurus(o.amount);
    const paid = await getAllocatedKurus("OPENING_BALANCE", o.id);
    push({ kind: "OPENING_BALANCE", id: o.id, label: "Açılış bakiyesi", docDate: o.as_of_date, totalKurus: total, paidKurus: paid, remainingKurus: total - paid });
  }
  for (const s of sales) {
    const b = await getSaleBalance(s.id);
    push({
      kind: "SALE", id: s.id, label: s.document_no, docDate: s.sale_date, dueDate: s.due_date,
      totalKurus: b.total, paidKurus: b.paid, remainingKurus: b.remaining,
    });
  }
  for (const s of services) {
    const b = await getServiceBalance(s.id);
    push({
      kind: "SERVICE", id: s.id, label: s.document_no, docDate: s.delivered_date ?? s.completed_date ?? s.received_date,
      dueDate: s.due_date, totalKurus: b.total, paidKurus: b.paid, remainingKurus: b.remaining,
    });
  }
  items.sort((a, b) => a.refDate.localeCompare(b.refDate));

  const openKurus = items.reduce((acc, i) => acc + i.remainingKurus, 0);
  return {
    items,
    openKurus,
    balanceKurus: balance.balance,
    creditKurus: Math.max(0, openKurus - balance.balance),
    aging: ageItems(items, todayLocalDate()),
  };
}

export const AGING_LABELS = Object.fromEntries(AGING_BANDS.map((b) => [b.id, b.label])) as Record<AgingBandId, string>;

export type CollectionAllocation = { kind: AllocationSource; id: string; amountKurus: number };

const SCOPE = () =>
  [
    db.customers,
    db.opening_balances,
    db.sales,
    db.services,
    db.payments,
    db.payment_allocations,
    db.return_transactions,
    db.sync_queue,
    db.audit_logs,
  ] as const;

async function writeAllocations(
  ctx: BusinessContext,
  paymentId: string,
  allocations: CollectionAllocation[]
): Promise<void> {
  const now = nowISO();
  for (const a of allocations) {
    const row = {
      id: generateId(),
      business_id: ctx.businessId,
      payment_id: paymentId,
      source_type: a.kind,
      source_id: a.id,
      allocated_amount: fromKurus(a.amountKurus),
      created_at: now,
    };
    await db.payment_allocations.add(row);
    await enqueue("payment_allocations", row.id, "INSERT", row, ctx.deviceCode);
  }
}

function validateAllocations(open: CustomerOpenItems, allocations: CollectionAllocation[], limitKurus: number): void {
  const seen = new Set<string>();
  let sum = 0;
  for (const a of allocations) {
    const key = openItemKey(a.kind, a.id);
    if (seen.has(key)) throw new FinanceRuleError("Aynı kalem iki kez seçilemez.");
    seen.add(key);
    if (!Number.isInteger(a.amountKurus) || a.amountKurus <= 0) throw new FinanceRuleError("Tahsis tutarı sıfırdan büyük olmalıdır.");
    const item = open.items.find((i) => i.key === key);
    if (!item) throw new FinanceRuleError("Tahsis edilen kalem açık değil.");
    if (a.amountKurus > item.remainingKurus) {
      throw new FinanceRuleError(`“${item.label}” için en fazla ${fromKurus(item.remainingKurus).toFixed(2).replace(".", ",")} ₺ tahsis edilebilir.`);
    }
    sum += a.amountKurus;
  }
  if (sum > limitKurus) throw new FinanceRuleError("Tahsis toplamı tahsilat tutarını aşamaz.");
}

/**
 * Belgesiz genel tahsilat (FR-017, AC-040): ödeme müşteriye yazılır, verilen
 * tahsisler seçilen açık kalemlerin kalanını düşürür. Dağıtılmayan kısım müşteri
 * alacağı (avans) olarak kalır; sonradan onayla borçlara mahsup edilebilir.
 * Varsayılan dağıtım için `fifoAllocate` (en eski kalem önce) kullanılır.
 */
export async function recordCustomerCollection(
  ctx: BusinessContext,
  params: {
    customerId: string;
    method: PaymentMethod;
    amountKurus: number;
    note?: string;
    allocations: CollectionAllocation[];
  }
) {
  return db.transaction("rw", [...SCOPE()], async () => {
    const open = await getCustomerOpenItems(ctx.businessId, params.customerId);
    validateAllocations(open, params.allocations, params.amountKurus);
    const payment = await recordPartyPayment(ctx, {
      partyType: "CUSTOMER",
      partyId: params.customerId,
      direction: "IN",
      method: params.method,
      amountKurus: params.amountKurus,
      note: params.note,
    });
    await writeAllocations(ctx, payment.id, params.allocations);
    return payment;
  });
}

export type UnallocatedPayment = { paymentId: string; paymentDate: string; unallocatedKurus: number };

/** Belgeye bağlanmamış ve henüz tamamen tahsis edilmemiş genel tahsilatlar (avanslar), eskiden yeniye. */
export async function getUnallocatedPayments(businessId: string, customerId: string): Promise<UnallocatedPayment[]> {
  const payments = await db.payments
    .where("customer_id")
    .equals(customerId)
    .filter((p) => p.business_id === businessId)
    .toArray();
  const reversed = new Set(payments.filter((p) => p.reversal_of_id).map((p) => p.reversal_of_id as string));
  const out: UnallocatedPayment[] = [];
  for (const p of payments.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (p.direction !== "IN" || p.reversal_of_id || reversed.has(p.id) || p.source_type || p.source_id) continue;
    const allocs = await db.payment_allocations.where("payment_id").equals(p.id).toArray();
    const left = toKurus(p.amount) - allocs.reduce((acc, a) => acc + toKurus(a.allocated_amount), 0);
    if (left > 0) out.push({ paymentId: p.id, paymentDate: p.payment_date, unallocatedKurus: left });
  }
  return out;
}

/**
 * Müşteri avansını borçlara mahsup eder (AC-040): kullanıcı onayıyla, seçilen
 * açık kalemlere. Avans, en eski genel tahsilattan başlayarak kullanılır.
 */
export async function applyCustomerCredit(
  ctx: BusinessContext,
  customerId: string,
  allocations: CollectionAllocation[]
): Promise<void> {
  await db.transaction("rw", [...SCOPE()], async () => {
    const [open, advances] = await Promise.all([
      getCustomerOpenItems(ctx.businessId, customerId),
      getUnallocatedPayments(ctx.businessId, customerId),
    ]);
    const available = advances.reduce((acc, a) => acc + a.unallocatedKurus, 0);
    validateAllocations(open, allocations, available);
    if (allocations.length === 0) throw new FinanceRuleError("Mahsup edilecek kalemi seçin.");

    // Her kalem tutarını, avansların sırayla kalanlarından karşıla.
    const pool = advances.map((a) => ({ ...a }));
    let total = 0;
    for (const a of allocations) {
      let need = a.amountKurus;
      total += a.amountKurus;
      for (const adv of pool) {
        if (need <= 0) break;
        const take = Math.min(need, adv.unallocatedKurus);
        if (take <= 0) continue;
        await writeAllocations(ctx, adv.paymentId, [{ ...a, amountKurus: take }]);
        adv.unallocatedKurus -= take;
        need -= take;
      }
    }
    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "customers",
      entityId: customerId,
      action: "UPDATE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason: "Müşteri avansı borçlara mahsup edildi",
      newValue: { mahsup_kurus: total, kalemler: allocations.length },
    });
  });
}
