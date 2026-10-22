import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { Customer } from "@/types";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { CustomerFields } from "./schema";

/** Aynı normalize telefonla kayıtlı başka müşteri var (AC-029). */
export class DuplicatePhoneError extends Error {
  constructor(public readonly existing: Customer) {
    super(`Bu telefon numarası “${existing.name}” adlı müşteride kayıtlı.`);
    this.name = "DuplicatePhoneError";
  }
}

/** Açık servisi olan müşteri arşivlenemez (AC-030). */
export class CustomerHasOpenServiceError extends Error {
  constructor() {
    super("Açık servisi olan müşteri arşivlenemez. Önce servisi teslim edin veya iptal edin.");
    this.name = "CustomerHasOpenServiceError";
  }
}

export class CustomerNotFoundError extends Error {
  constructor() {
    super("Müşteri bulunamadı.");
    this.name = "CustomerNotFoundError";
  }
}

const EDITABLE_COLUMNS = [
  "name",
  "phone",
  "phone_normalized",
  "no_phone_flag",
  "village",
  "address",
  "notes",
  "archived_at",
] as const;

/** Boş alanlar `null` gönderilir; aksi halde sunucu eski değeri korur. */
function editablePayload(customer: Customer): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: customer.id,
    business_id: customer.business_id,
  };
  for (const column of EDITABLE_COLUMNS) {
    payload[column] = customer[column] ?? null;
  }
  return payload;
}

const CLOSED_SERVICE_STATUSES = ["DELIVERED", "CANCELLED"];

/** Aynı normalize telefona sahip (arşivlenmemiş) müşteriler. */
export async function findCustomersByPhone(
  businessId: string,
  normalizedPhone: string,
  excludeId?: string
): Promise<Customer[]> {
  if (!normalizedPhone) return [];
  return db.customers
    .where("phone_normalized")
    .equals(normalizedPhone)
    .filter((c) => c.business_id === businessId && c.id !== excludeId && !c.archived_at)
    .toArray();
}

export async function createCustomer(
  ctx: BusinessContext,
  fields: CustomerFields,
  options: { allowDuplicatePhone?: boolean } = {}
): Promise<Customer> {
  const now = nowISO();
  const customer: Customer = {
    ...fields,
    id: generateId(),
    business_id: ctx.businessId,
    created_at: now,
    updated_at: now,
  };

  await db.transaction("rw", db.customers, db.sync_queue, async () => {
    if (fields.phone_normalized && !options.allowDuplicatePhone) {
      const [existing] = await findCustomersByPhone(ctx.businessId, fields.phone_normalized);
      if (existing) throw new DuplicatePhoneError(existing);
    }
    await db.customers.add(customer);
    await enqueue(
      "customers",
      customer.id,
      "INSERT",
      { ...editablePayload(customer), created_at: now },
      ctx.deviceCode
    );
  });

  return customer;
}

export async function updateCustomer(
  ctx: BusinessContext,
  id: string,
  fields: CustomerFields,
  options: { allowDuplicatePhone?: boolean } = {}
): Promise<Customer> {
  return db.transaction("rw", db.customers, db.sync_queue, async () => {
    const existing = await db.customers.get(id);
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new CustomerNotFoundError();
    }

    const phoneChanged = fields.phone_normalized !== existing.phone_normalized;
    if (phoneChanged && fields.phone_normalized && !options.allowDuplicatePhone) {
      const [other] = await findCustomersByPhone(ctx.businessId, fields.phone_normalized, id);
      if (other) throw new DuplicatePhoneError(other);
    }

    const next: Customer = { ...existing, ...fields, updated_at: nowISO() };
    if (JSON.stringify(editablePayload(existing)) === JSON.stringify(editablePayload(next))) {
      return existing;
    }
    await db.customers.put(next);
    await enqueue(
      "customers",
      id,
      "UPDATE",
      { ...editablePayload(next), version: existing.version ?? 1 },
      ctx.deviceCode
    );
    return next;
  });
}

/**
 * Müşteriyi arşivler veya geri açar. Açık servisi olan müşteri arşivlenemez
 * (AC-030). Sıfırdan farklı bakiye kontrolü, bakiye hesabı (Adım 2.8)
 * yazıldığında buraya eklenecek.
 */
export async function setCustomerArchived(
  ctx: BusinessContext,
  id: string,
  archived: boolean,
  reason?: string
): Promise<Customer> {
  return db.transaction("rw", [db.customers, db.services, db.sync_queue, db.audit_logs], async () => {
    const existing = await db.customers.get(id);
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new CustomerNotFoundError();
    }

    if (archived) {
      const openServices = await db.services
        .where("customer_id")
        .equals(id)
        .filter((s) => !CLOSED_SERVICE_STATUSES.includes(s.status))
        .count();
      if (openServices > 0) throw new CustomerHasOpenServiceError();
    }

    const now = nowISO();
    const next: Customer = { ...existing, archived_at: archived ? now : undefined, updated_at: now };
    await db.customers.put(next);
    await enqueue(
      "customers",
      id,
      "UPDATE",
      { ...editablePayload(next), version: existing.version ?? 1 },
      ctx.deviceCode
    );
    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "customers",
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
