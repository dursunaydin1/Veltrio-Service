import { db } from "@/lib/db";
import { getSupplierBalance } from "@/lib/finance/service";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { Supplier } from "@/types";
import type { SupplierFields } from "./schema";

export class SupplierRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierRuleError";
  }
}

const EDITABLE_COLUMNS = ["name", "phone", "address", "notes", "archived_at"] as const;

/** Boş alanlar `null` gönderilir; aksi halde sunucu eski değeri korur. */
function editablePayload(supplier: Supplier): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: supplier.id, business_id: supplier.business_id };
  for (const column of EDITABLE_COLUMNS) payload[column] = supplier[column] ?? null;
  return payload;
}

type SupplierRecord = Supplier & { version?: number };

export async function createSupplier(ctx: BusinessContext, fields: SupplierFields): Promise<Supplier> {
  const now = nowISO();
  const supplier: Supplier = {
    ...fields,
    id: generateId(),
    business_id: ctx.businessId,
    created_at: now,
    updated_at: now,
  };
  await db.transaction("rw", db.suppliers, db.sync_queue, async () => {
    await db.suppliers.add(supplier);
    await enqueue("suppliers", supplier.id, "INSERT", { ...editablePayload(supplier), created_at: now }, ctx.deviceCode);
  });
  return supplier;
}

export async function updateSupplier(
  ctx: BusinessContext,
  id: string,
  fields: SupplierFields
): Promise<Supplier> {
  return db.transaction("rw", db.suppliers, db.sync_queue, async () => {
    const existing = (await db.suppliers.get(id)) as SupplierRecord | undefined;
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new SupplierRuleError("Tedarikçi bulunamadı.");
    }
    const next: SupplierRecord = { ...existing, ...fields, updated_at: nowISO() };
    if (JSON.stringify(editablePayload(existing)) === JSON.stringify(editablePayload(next))) {
      return existing;
    }
    await db.suppliers.put(next);
    await enqueue("suppliers", id, "UPDATE", { ...editablePayload(next), version: existing.version ?? 1 }, ctx.deviceCode);
    return next;
  });
}

/**
 * Tedarikçiyi arşivler / geri açar. Bakiyesi sıfır olmayan tedarikçi
 * arşivlenemez; geçmiş alımlar ve ödemeler korunur.
 */
export async function setSupplierArchived(
  ctx: BusinessContext,
  id: string,
  archived: boolean,
  reason?: string
): Promise<Supplier> {
  return db.transaction(
    "rw",
    [db.suppliers, db.opening_balances, db.payments, db.purchases, db.sync_queue, db.audit_logs],
    async () => {
      const existing = (await db.suppliers.get(id)) as SupplierRecord | undefined;
      if (!existing || existing.business_id !== ctx.businessId) {
        throw new SupplierRuleError("Tedarikçi bulunamadı.");
      }
      if (archived) {
        const { balance } = await getSupplierBalance(ctx.businessId, id);
        if (balance !== 0) {
          throw new SupplierRuleError("Bakiyesi sıfır olmayan tedarikçi arşivlenemez. Önce borç / alacağı kapatın.");
        }
      }

      const now = nowISO();
      const next: SupplierRecord = { ...existing, archived_at: archived ? now : undefined, updated_at: now };
      await db.suppliers.put(next);
      await enqueue("suppliers", id, "UPDATE", { ...editablePayload(next), version: existing.version ?? 1 }, ctx.deviceCode);
      await writeAuditLog({
        businessId: ctx.businessId,
        entityType: "suppliers",
        entityId: id,
        action: "STATE_CHANGE",
        deviceCode: ctx.deviceCode,
        actorId: ctx.actorId,
        reason,
        oldValue: { archived_at: existing.archived_at ?? null },
        newValue: { archived_at: next.archived_at ?? null },
      });
      return next;
    }
  );
}
