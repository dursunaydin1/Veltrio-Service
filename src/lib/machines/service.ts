import { db } from "@/lib/db";
import { nextDocumentNo } from "@/lib/numbering";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import { foldText } from "@/lib/utils/search";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { Machine, MachineOwnershipChange } from "@/types";
import type { MachineFields } from "./schema";

/** Aynı markada aynı seri numaralı başka makine var (AC-029). */
export class DuplicateSerialError extends Error {
  constructor(public readonly existing: Machine) {
    super(`Bu marka ve seri numarası başka bir makinede kayıtlı (${existing.internal_number ?? existing.id}).`);
    this.name = "DuplicateSerialError";
  }
}

/** Açık servisi olan makine arşivlenemez (FR-033). */
export class MachineHasOpenServiceError extends Error {
  constructor() {
    super("Açık servisi olan makine arşivlenemez. Önce servisi teslim edin veya iptal edin.");
    this.name = "MachineHasOpenServiceError";
  }
}

export class MachineRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MachineRuleError";
  }
}

const EDITABLE_COLUMNS = [
  "customer_id",
  "type",
  "brand",
  "model",
  "serial_number",
  "year",
  "is_temporary",
  "merged_into_id",
  "qr_code",
  "internal_number",
  "sale_id",
  "sale_date",
  "sale_price",
  "warranty_until",
  "notes",
  "archived_at",
] as const;

/** Boş alanlar `null` gönderilir; aksi halde sunucu eski değeri korur. */
function editablePayload(machine: Machine): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: machine.id, business_id: machine.business_id };
  for (const column of EDITABLE_COLUMNS) payload[column] = machine[column] ?? null;
  return payload;
}

const CLOSED_SERVICE_STATUSES = ["DELIVERED", "CANCELLED"];

/** Aynı marka + seri numaralı (arşivlenmemiş, birleştirilmemiş) makineler. */
export async function findMachinesBySerial(
  businessId: string,
  brand: string | undefined,
  serial: string | undefined,
  excludeId?: string
): Promise<Machine[]> {
  if (!serial?.trim()) return [];
  const wantedSerial = foldText(serial.trim());
  const wantedBrand = foldText((brand ?? "").trim());
  return db.machines
    .where("business_id")
    .equals(businessId)
    .filter(
      (m) =>
        m.id !== excludeId &&
        !m.archived_at &&
        !m.merged_into_id &&
        !!m.serial_number &&
        foldText(m.serial_number.trim()) === wantedSerial &&
        foldText((m.brand ?? "").trim()) === wantedBrand
    )
    .toArray();
}

/**
 * Makine oluşturur. Her makineye benzersiz iç numara (MK-…) atanır; seri
 * numarası yoksa makine bununla tanınır. Aynı markada aynı seri numarası varsa
 * uyarır (kullanıcı onayıyla devam edilebilir).
 */
export async function createMachine(
  ctx: BusinessContext,
  fields: MachineFields & Partial<Pick<Machine, "sale_id" | "sale_date" | "sale_price">>,
  options: { allowDuplicateSerial?: boolean } = {}
): Promise<Machine> {
  return db.transaction(
    "rw",
    [db.machines, db.customers, db.counters, db.sync_queue],
    async () => {
      const owner = await db.customers.get(fields.customer_id);
      if (!owner || owner.business_id !== ctx.businessId) {
        throw new MachineRuleError("Müşteri bulunamadı.");
      }
      if (fields.serial_number && !options.allowDuplicateSerial) {
        const [existing] = await findMachinesBySerial(ctx.businessId, fields.brand, fields.serial_number);
        if (existing) throw new DuplicateSerialError(existing);
      }

      const now = nowISO();
      const machine: Machine = {
        ...fields,
        id: generateId(),
        business_id: ctx.businessId,
        internal_number: await nextDocumentNo("machine", ctx.deviceCode),
        created_at: now,
        updated_at: now,
      };
      await db.machines.add(machine);
      await enqueue(
        "machines",
        machine.id,
        "INSERT",
        { ...editablePayload(machine), created_at: now },
        ctx.deviceCode
      );
      return machine;
    }
  );
}

/**
 * Makine bilgilerini günceller. Sahip bu işlemle değişmez; sahip değişikliği
 * `changeMachineOwner` ile geçmişe yazılarak yapılır (AC-018).
 */
export async function updateMachine(
  ctx: BusinessContext,
  id: string,
  fields: Omit<MachineFields, "customer_id">,
  options: { allowDuplicateSerial?: boolean } = {}
): Promise<Machine> {
  return db.transaction("rw", [db.machines, db.sync_queue], async () => {
    const existing = await db.machines.get(id);
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new MachineRuleError("Makine bulunamadı.");
    }

    const identityChanged =
      foldText(fields.serial_number ?? "") !== foldText(existing.serial_number ?? "") ||
      foldText(fields.brand ?? "") !== foldText(existing.brand ?? "");
    if (identityChanged && fields.serial_number && !options.allowDuplicateSerial) {
      const [other] = await findMachinesBySerial(ctx.businessId, fields.brand, fields.serial_number, id);
      if (other) throw new DuplicateSerialError(other);
    }

    const next: Machine = { ...existing, ...fields, updated_at: nowISO() };
    if (JSON.stringify(editablePayload(existing)) === JSON.stringify(editablePayload(next))) {
      return existing;
    }
    await db.machines.put(next);
    await enqueue(
      "machines",
      id,
      "UPDATE",
      { ...editablePayload(next), version: existing.version ?? 1 },
      ctx.deviceCode
    );
    return next;
  });
}

/**
 * Makine sahibini değiştirir (AC-018): neden zorunludur; eski/yeni müşteri,
 * aktör ve cihaz yalnızca-ekleme geçmişe yazılır, audit log'a düşer. Makineye
 * bağlı servis geçmişi korunur (servisler makineye bağlıdır).
 */
export async function changeMachineOwner(
  ctx: BusinessContext,
  machineId: string,
  newCustomerId: string,
  reason: string
): Promise<Machine> {
  const why = reason.trim();
  if (!why) throw new MachineRuleError("Sahip değiştirme nedeni zorunludur.");

  return db.transaction(
    "rw",
    [db.machines, db.customers, db.machine_ownership_history, db.sync_queue, db.audit_logs],
    async () => {
      const existing = await db.machines.get(machineId);
      if (!existing || existing.business_id !== ctx.businessId) {
        throw new MachineRuleError("Makine bulunamadı.");
      }
      if (existing.customer_id === newCustomerId) {
        throw new MachineRuleError("Seçilen müşteri zaten makinenin sahibi.");
      }
      const newOwner = await db.customers.get(newCustomerId);
      if (!newOwner || newOwner.business_id !== ctx.businessId) {
        throw new MachineRuleError("Yeni müşteri bulunamadı.");
      }

      const now = nowISO();
      const change: MachineOwnershipChange = {
        id: generateId(),
        business_id: ctx.businessId,
        machine_id: machineId,
        old_customer_id: existing.customer_id,
        new_customer_id: newCustomerId,
        reason: why,
        actor_id: ctx.actorId,
        changed_by_device: ctx.deviceCode,
        changed_at: now,
      };
      await db.machine_ownership_history.add(change);
      await enqueue(
        "machine_ownership_history",
        change.id,
        "INSERT",
        {
          id: change.id,
          business_id: change.business_id,
          machine_id: change.machine_id,
          old_customer_id: change.old_customer_id ?? null,
          new_customer_id: change.new_customer_id ?? null,
          reason: change.reason,
          actor_id: change.actor_id ?? null,
          changed_by_device: change.changed_by_device,
          changed_at: change.changed_at,
        },
        ctx.deviceCode
      );

      const next: Machine = { ...existing, customer_id: newCustomerId, updated_at: now };
      await db.machines.put(next);
      await enqueue(
        "machines",
        machineId,
        "UPDATE",
        { ...editablePayload(next), version: existing.version ?? 1 },
        ctx.deviceCode
      );

      await writeAuditLog({
        businessId: ctx.businessId,
        entityType: "machines",
        entityId: machineId,
        action: "UPDATE",
        deviceCode: ctx.deviceCode,
        actorId: ctx.actorId,
        reason: why,
        oldValue: { customer_id: existing.customer_id ?? null },
        newValue: { customer_id: newCustomerId, ownership_change_id: change.id },
      });
      return next;
    }
  );
}

/** Makineyi arşivler / geri açar. Açık servisi olan makine arşivlenemez (FR-033). */
export async function setMachineArchived(
  ctx: BusinessContext,
  id: string,
  archived: boolean,
  reason?: string
): Promise<Machine> {
  return db.transaction(
    "rw",
    [db.machines, db.services, db.sync_queue, db.audit_logs],
    async () => {
      const existing = await db.machines.get(id);
      if (!existing || existing.business_id !== ctx.businessId) {
        throw new MachineRuleError("Makine bulunamadı.");
      }
      if (archived) {
        const open = await db.services
          .where("machine_id")
          .equals(id)
          .filter((s) => !CLOSED_SERVICE_STATUSES.includes(s.status))
          .count();
        if (open > 0) throw new MachineHasOpenServiceError();
      }

      const now = nowISO();
      const next: Machine = { ...existing, archived_at: archived ? now : undefined, updated_at: now };
      await db.machines.put(next);
      await enqueue(
        "machines",
        id,
        "UPDATE",
        { ...editablePayload(next), version: existing.version ?? 1 },
        ctx.deviceCode
      );
      await writeAuditLog({
        businessId: ctx.businessId,
        entityType: "machines",
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

/** Satış iptalinde makineden satış bilgisini (belge, tarih, fiyat) kaldırır. */
export async function detachSaleFromMachine(ctx: BusinessContext, machineId: string): Promise<Machine> {
  return db.transaction("rw", [db.machines, db.sync_queue], async () => {
    const existing = await db.machines.get(machineId);
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new MachineRuleError("Makine bulunamadı.");
    }
    const next: Machine = {
      ...existing,
      sale_id: undefined,
      sale_date: undefined,
      sale_price: undefined,
      updated_at: nowISO(),
    };
    await db.machines.put(next);
    await enqueue(
      "machines",
      machineId,
      "UPDATE",
      { ...editablePayload(next), version: existing.version ?? 1 },
      ctx.deviceCode
    );
    return next;
  });
}

/**
 * Makine satışıyla oluşan / eşleşen makineye satış bilgisini (belge, tarih,
 * fiyat) yazar. Satış kesinleşirken, satış işleminin içinde çağrılır.
 */
export async function attachSaleToMachine(
  ctx: BusinessContext,
  machineId: string,
  sale: { saleId: string; saleDate: string; salePrice: number }
): Promise<Machine> {
  return db.transaction("rw", [db.machines, db.sync_queue], async () => {
    const existing = await db.machines.get(machineId);
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new MachineRuleError("Makine bulunamadı.");
    }
    const next: Machine = {
      ...existing,
      sale_id: sale.saleId,
      sale_date: sale.saleDate,
      sale_price: sale.salePrice,
      updated_at: nowISO(),
    };
    await db.machines.put(next);
    await enqueue(
      "machines",
      machineId,
      "UPDATE",
      { ...editablePayload(next), version: existing.version ?? 1 },
      ctx.deviceCode
    );
    return next;
  });
}

/**
 * Geçici makine kaydını mevcut bir makineyle birleştirir (SR-016, AC-051).
 * Geçici makinedeki servisler hedef makineye taşınır, geçici kayıt arşivlenir ve
 * `merged_into_id` ile hedefe bağlanır; hiçbir kayıt silinmez. Aynı müşteriye ait
 * olmayan veya geçici olmayan kayıtlar birleştirilmez. Nedenle birlikte audit log'a yazılır.
 */
export async function mergeTemporaryMachine(
  ctx: BusinessContext,
  temporaryId: string,
  targetId: string,
  reason: string
): Promise<Machine> {
  const why = reason.trim();
  if (!why) throw new MachineRuleError("Birleştirme nedeni zorunludur.");
  if (temporaryId === targetId) throw new MachineRuleError("Makine kendisiyle birleştirilemez.");

  return db.transaction(
    "rw",
    [db.machines, db.services, db.sync_queue, db.audit_logs],
    async () => {
      const source = await db.machines.get(temporaryId);
      const target = await db.machines.get(targetId);
      if (!source || !target || source.business_id !== ctx.businessId || target.business_id !== ctx.businessId) {
        throw new MachineRuleError("Makine bulunamadı.");
      }
      if (!source.is_temporary) throw new MachineRuleError("Yalnızca geçici makine kaydı birleştirilebilir.");
      if (target.is_temporary) throw new MachineRuleError("Hedef makine de geçici; önce marka ve model bilgilerini tamamlayın.");
      if (target.archived_at || target.merged_into_id) throw new MachineRuleError("Hedef makine arşivde veya başka bir makineyle birleştirilmiş.");
      if (source.merged_into_id || source.archived_at) throw new MachineRuleError("Bu geçici kayıt zaten birleştirilmiş veya arşivlenmiş.");
      if (source.customer_id !== target.customer_id) {
        throw new MachineRuleError("Makineler aynı müşteriye ait olmalıdır.");
      }

      const now = nowISO();
      const services = await db.services.where("machine_id").equals(temporaryId).toArray();
      for (const service of services) {
        const moved = { ...service, machine_id: targetId, updated_at: now };
        await db.services.put(moved);
        // Güncellemede makine alanı normalde gönderilmez (değişmez alan); birleştirme tek istisnadır.
        await enqueue(
          "services",
          service.id,
          "UPDATE",
          { id: service.id, business_id: service.business_id, machine_id: targetId, version: service.version ?? 1 },
          ctx.deviceCode
        );
      }

      const merged: Machine = { ...source, merged_into_id: targetId, archived_at: now, updated_at: now };
      await db.machines.put(merged);
      await enqueue(
        "machines",
        temporaryId,
        "UPDATE",
        { ...editablePayload(merged), version: source.version ?? 1 },
        ctx.deviceCode
      );
      await writeAuditLog({
        businessId: ctx.businessId,
        entityType: "machines",
        entityId: temporaryId,
        action: "STATE_CHANGE",
        deviceCode: ctx.deviceCode,
        actorId: ctx.actorId,
        reason: why,
        oldValue: { merged_into_id: null, services_moved: services.length },
        newValue: { merged_into_id: targetId },
      });
      return merged;
    }
  );
}
