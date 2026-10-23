import { db } from "@/lib/db";
import { toKurus } from "@/lib/calc";

export type AllocationSource = "SALE" | "SERVICE" | "OPENING_BALANCE";

/**
 * Bir belgeye (satış, servis, açılış bakiyesi) belgesiz genel tahsilattan
 * tahsis edilmiş geçerli tutar, kuruş (PRD §9.4). Ters kaydedilmiş ödemelerin
 * ve ters kayıtların tahsisi sayılmaz; böylece hatalı tahsilat geri alınınca
 * belgenin kalanı eski hâline döner.
 */
export async function getAllocatedKurus(sourceType: AllocationSource, sourceId: string): Promise<number> {
  const allocations = await db.payment_allocations
    .where("source_id")
    .equals(sourceId)
    .filter((a) => a.source_type === sourceType)
    .toArray();
  if (allocations.length === 0) return 0;

  const payments = (await db.payments.bulkGet([...new Set(allocations.map((a) => a.payment_id))])).filter(
    (p): p is NonNullable<typeof p> => !!p
  );
  const customerIds = [...new Set(payments.map((p) => p.customer_id).filter((id): id is string => !!id))];
  const related = customerIds.length > 0 ? await db.payments.where("customer_id").anyOf(customerIds).toArray() : [];
  const reversed = new Set(related.filter((p) => p.reversal_of_id).map((p) => p.reversal_of_id as string));

  const valid = new Set(
    payments.filter((p) => p.direction === "IN" && !p.reversal_of_id && !reversed.has(p.id)).map((p) => p.id)
  );
  return allocations.filter((a) => valid.has(a.payment_id)).reduce((acc, a) => acc + toKurus(a.allocated_amount), 0);
}
