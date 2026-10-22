import { db } from "@/lib/db";
import type { Service } from "@/lib/db";
import { fromKurus, toKurus } from "@/lib/calc";
import { recordCustomerPayment } from "@/lib/finance/service";
import { createMachine } from "@/lib/machines/service";
import { nextDocumentNo } from "@/lib/numbering";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { PaymentMethod } from "@/types";
import { isBilled, needsApprovalBeforeWork, summarizeLines } from "./lines";
import {
  canTransition,
  isReopen,
  isServiceStatus,
  requiresReason,
  statusLabel,
  type ServiceStatus,
} from "./status";

/**
 * Servis işlemlerinin bağlamı: işletme/cihaz/kullanıcı + işletme ayarları.
 * Onay eşiği 1.000 ₺ varsayılandır (0 = ücretli her işte onay); negatif stok
 * ayarı parça kullanımında stok kuralına aktarılır.
 */
export type ServiceContext = BusinessContext & {
  approvalThreshold?: number;
  allowNegativeStock?: boolean;
};

export const DEFAULT_APPROVAL_THRESHOLD = 1000;

export class ServiceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceRuleError";
  }
}

/** Sunucuya gönderilen sütunlar (eklemede hepsi). */
const INSERT_COLUMNS = [
  "customer_id",
  "machine_id",
  "document_no",
  "status",
  "description",
  "customer_complaint",
  "diagnosis",
  "resolution",
  "deposit_amount",
  "labor_fee",
  "total_amount",
  "promised_date",
  "received_date",
  "completed_date",
  "delivered_date",
  "first_completed_at",
  "warranty_until",
  "is_warranty_claim",
  "cancel_reason",
  "existing_damage",
  "received_accessories",
  "created_by_device",
  "created_at",
] as const;

/** Güncellemede belge no, müşteri, makine ve kabul bilgisi (değişmez alanlar) gönderilmez. */
const UPDATE_COLUMNS = INSERT_COLUMNS.filter(
  (c) =>
    !["customer_id", "machine_id", "document_no", "received_date", "created_by_device", "created_at"].includes(c)
);

/** Boş alanlar `null` gönderilir; aksi halde sunucu eski değeri korur. */
function payloadOf(service: Service, columns: readonly (keyof Service)[]): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: service.id, business_id: service.business_id };
  for (const column of columns) payload[column] = service[column] ?? null;
  return payload;
}
const insertPayload = (s: Service) => payloadOf(s, INSERT_COLUMNS);
const updatePayload = (s: Service) => ({
  ...payloadOf(s, UPDATE_COLUMNS),
  // Sunucuya eklenmiş ama henüz geri çekilmemiş kayıtta version yoktur; sunucu 1 ile başlar.
  version: s.version ?? 1,
});

async function addHistory(
  ctx: BusinessContext,
  serviceId: string,
  from: string | undefined,
  to: string,
  note?: string
): Promise<void> {
  const row = {
    id: generateId(),
    business_id: ctx.businessId,
    service_id: serviceId,
    from_status: from,
    to_status: to,
    actor_id: ctx.actorId,
    changed_by_device: ctx.deviceCode,
    note: note?.trim() || undefined,
    changed_at: nowISO(),
  };
  await db.service_status_history.add(row);
  await enqueue(
    "service_status_history",
    row.id,
    "INSERT",
    {
      id: row.id,
      business_id: row.business_id,
      service_id: row.service_id,
      from_status: row.from_status ?? null,
      to_status: row.to_status,
      actor_id: row.actor_id ?? null,
      changed_by_device: row.changed_by_device,
      note: row.note ?? null,
      changed_at: row.changed_at,
    },
    ctx.deviceCode
  );
}

export type OpenServiceParams = {
  customerId: string;
  /** Mevcut makine (müşteriye ait olmalı) */
  machineId?: string;
  /** Makine belirlenemiyorsa verilir: geçici makine kaydı açılır (SR-016) */
  temporaryMachineType?: string;
  complaint: string;
  existingDamage?: string;
  accessories?: string;
  /** YYYY-MM-DD */
  promisedDate?: string;
  /** Kabulde alınan kapora */
  deposit?: { amountKurus: number; method: PaymentMethod };
};

const tidy = (v?: string) => v?.trim() || undefined;

/**
 * Servis kabulü (§5.1): UUID ve `S-[cihaz]-[yıl]-[sıra]` numarasıyla "Kabul
 * edildi" durumunda servis açar. Makine seçilmezse geçici makine kaydı açılır.
 * Kapora varsa servise bağlı bir tahsilat olarak kaydedilir (SR-018). Hepsi
 * tek işlemde yazılır; biri başarısız olursa hiçbiri kaydedilmez.
 */
export async function openService(ctx: BusinessContext, params: OpenServiceParams): Promise<Service> {
  const complaint = tidy(params.complaint);
  if (!complaint) throw new ServiceRuleError("Müşteri şikâyeti zorunludur.");
  if (!params.machineId && !tidy(params.temporaryMachineType)) {
    throw new ServiceRuleError("Makine seçin veya makine türünü yazarak geçici kayıt açın.");
  }
  if (params.promisedDate && !/^\d{4}-\d{2}-\d{2}$/.test(params.promisedDate)) {
    throw new ServiceRuleError("Teslim tarihi geçersiz.");
  }

  return db.transaction(
    "rw",
    [
      db.services,
      db.customers,
      db.machines,
      db.counters,
      db.payments,
      db.service_status_history,
      db.sync_queue,
    ],
    async () => {
      const customer = await db.customers.get(params.customerId);
      if (!customer || customer.business_id !== ctx.businessId) {
        throw new ServiceRuleError("Müşteri bulunamadı.");
      }
      if (customer.archived_at) throw new ServiceRuleError("Arşivlenmiş müşteriye servis açılamaz.");

      let machineId = params.machineId;
      if (machineId) {
        const machine = await db.machines.get(machineId);
        if (!machine || machine.business_id !== ctx.businessId) {
          throw new ServiceRuleError("Makine bulunamadı.");
        }
        if (machine.archived_at) throw new ServiceRuleError("Arşivlenmiş makineye servis açılamaz.");
        if (machine.customer_id !== params.customerId) {
          throw new ServiceRuleError("Seçilen makine bu müşteriye ait değil.");
        }
      } else {
        const temp = await createMachine(ctx, {
          customer_id: params.customerId,
          type: tidy(params.temporaryMachineType) as string,
          is_temporary: true,
        });
        machineId = temp.id;
      }

      const now = nowISO();
      const service: Service = {
        id: generateId(),
        business_id: ctx.businessId,
        document_no: await nextDocumentNo("service", ctx.deviceCode),
        customer_id: params.customerId,
        machine_id: machineId,
        status: "RECEIVED",
        customer_complaint: complaint,
        existing_damage: tidy(params.existingDamage),
        received_accessories: tidy(params.accessories),
        promised_date: params.promisedDate || undefined,
        deposit_amount: params.deposit ? fromKurus(params.deposit.amountKurus) : 0,
        labor_fee: 0,
        total_amount: 0,
        received_date: now,
        is_warranty_claim: false,
        created_by_device: ctx.deviceCode,
        created_at: now,
        updated_at: now,
      };

      await db.services.add(service);
      await enqueue("services", service.id, "INSERT", insertPayload(service), ctx.deviceCode);
      await addHistory(ctx, service.id, undefined, "RECEIVED", "Servis kabul edildi");

      if (params.deposit) {
        await recordCustomerPayment(ctx, {
          customerId: params.customerId,
          direction: "IN",
          method: params.deposit.method,
          amountKurus: params.deposit.amountKurus,
          note: `Kapora (${service.document_no})`,
          sourceType: "SERVICE",
          sourceId: service.id,
        });
      }
      return service;
    }
  );
}

/**
 * Durum değiştirir (§6.1). Geçersiz geçiş reddedilir; iptal ve yeniden açma
 * için neden zorunludur; her değişiklik değiştirilemez durum geçmişine yazılır
 * (AC-017). Teslim edilmiş servis iptal edilemez (AC-033). İlk tamamlanma
 * zamanı (`first_completed_at`) yeniden açılsa da korunur: servis sayacı ikinci
 * kez artmaz (SR-009).
 */
export async function changeServiceStatus(
  ctx: ServiceContext,
  serviceId: string,
  to: ServiceStatus,
  note?: string
): Promise<Service> {
  return db.transaction(
    "rw",
    [
      db.services,
      db.service_status_history,
      db.service_operations,
      db.service_parts,
      db.sync_queue,
      db.audit_logs,
    ],
    async () => {
      const existing = await db.services.get(serviceId);
      if (!existing || existing.business_id !== ctx.businessId) {
        throw new ServiceRuleError("Servis bulunamadı.");
      }
      if (!isServiceStatus(existing.status)) {
        throw new ServiceRuleError(`Bilinmeyen servis durumu: ${existing.status}`);
      }
      const from = existing.status;

      if (!canTransition(from, to)) {
        throw new ServiceRuleError(
          `“${statusLabel(from)}” durumundan “${statusLabel(to)}” durumuna geçilemez.`
        );
      }
      const why = note?.trim();
      if (requiresReason(from, to) && !why) {
        throw new ServiceRuleError(
          to === "CANCELLED" ? "İptal nedeni zorunludur." : "Yeniden açma nedeni zorunludur."
        );
      }

      // Teklif kuralları: onay gereken serviste karar bekleyen kalem varken işe
      // başlanamaz (SR-004); fiyatı belirsiz kalemle iş tamamlanamaz (SR-007).
      if (to === "IN_PROGRESS" && !isReopen(from, to)) {
        const summary = await loadQuoteSummary(serviceId);
        if (needsApprovalBeforeWork(summary, ctx.approvalThreshold ?? DEFAULT_APPROVAL_THRESHOLD)) {
          throw new ServiceRuleError(
            "Müşteri onayı gerekli: karar bekleyen kalemler var. Önce “Müşteri kararı”nı kaydedin."
          );
        }
      }
      if (to === "COMPLETED") {
        const summary = await loadQuoteSummary(serviceId);
        if (summary.unpriced > 0) {
          throw new ServiceRuleError("Fiyatı belirlenmemiş kalem var. Tüm kalemlere fiyat girin veya kaldırın.");
        }
      }

      const now = nowISO();
      const next: Service = { ...existing, status: to, updated_at: now };
      if (to === "COMPLETED") {
        next.completed_date = now;
        next.first_completed_at = existing.first_completed_at ?? now;
      }
      if (to === "DELIVERED") next.delivered_date = now;
      if (to === "CANCELLED") next.cancel_reason = why;
      if (isReopen(from, to)) {
        next.completed_date = undefined;
        next.delivered_date = undefined;
      }

      await db.services.put(next);
      await enqueue("services", serviceId, "UPDATE", updatePayload(next), ctx.deviceCode);
      await addHistory(ctx, serviceId, from, to, why);

      if (to === "CANCELLED" || isReopen(from, to)) {
        await writeAuditLog({
          businessId: ctx.businessId,
          entityType: "services",
          entityId: serviceId,
          action: "STATE_CHANGE",
          deviceCode: ctx.deviceCode,
          actorId: ctx.actorId,
          reason: why,
          oldValue: { status: from },
          newValue: { status: to },
        });
      }
      return next;
    }
  );
}

export type ServiceDetails = {
  customer_complaint?: string;
  diagnosis?: string;
  resolution?: string;
  promised_date?: string;
  existing_damage?: string;
  received_accessories?: string;
};

/** Servis bilgilerini (şikâyet, teşhis, yapılan iş, teslim sözü…) günceller. */
export async function updateServiceDetails(
  ctx: BusinessContext,
  serviceId: string,
  details: ServiceDetails
): Promise<Service> {
  if (details.promised_date && !/^\d{4}-\d{2}-\d{2}$/.test(details.promised_date)) {
    throw new ServiceRuleError("Teslim tarihi geçersiz.");
  }
  return db.transaction("rw", [db.services, db.sync_queue], async () => {
    const existing = await db.services.get(serviceId);
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new ServiceRuleError("Servis bulunamadı.");
    }
    if (existing.status === "CANCELLED") {
      throw new ServiceRuleError("İptal edilmiş servis düzenlenemez.");
    }
    if (!tidy(details.customer_complaint)) {
      throw new ServiceRuleError("Müşteri şikâyeti zorunludur.");
    }

    const next: Service = {
      ...existing,
      customer_complaint: tidy(details.customer_complaint),
      diagnosis: tidy(details.diagnosis),
      resolution: tidy(details.resolution),
      promised_date: details.promised_date || undefined,
      existing_damage: tidy(details.existing_damage),
      received_accessories: tidy(details.received_accessories),
      updated_at: nowISO(),
    };
    if (JSON.stringify(updatePayload(existing)) === JSON.stringify(updatePayload(next))) {
      return existing;
    }
    await db.services.put(next);
    await enqueue("services", serviceId, "UPDATE", updatePayload(next), ctx.deviceCode);
    return next;
  });
}

/** Makine seçilince gösterilen özet: servis sayısı, son servis (§5.1 adım 3). */
export async function getMachineServiceSummary(machineId: string): Promise<{
  completedCount: number;
  lastService?: Service;
}> {
  const services = await db.services.where("machine_id").equals(machineId).toArray();
  const completedCount = services.filter((s) => !!s.first_completed_at && s.status !== "CANCELLED").length;
  const lastService = services
    .filter((s) => s.status !== "CANCELLED")
    .sort((a, b) => b.received_date.localeCompare(a.received_date))[0];
  return { completedCount, lastService };
}

/** Serviste henüz iptal edilmemiş satırların teklif özeti. */
async function loadQuoteSummary(serviceId: string) {
  const [operations, parts] = await Promise.all([
    db.service_operations.where("service_id").equals(serviceId).toArray(),
    db.service_parts.where("service_id").equals(serviceId).toArray(),
  ]);
  return summarizeLines([...operations, ...parts]);
}

/**
 * Servis tutarlarını satırlardan yeniden hesaplar ve kaydeder:
 *   labor_fee    = faturalanan işlem satırları
 *   total_amount = faturalanan işlem + parça satırları (reddedilen/ertelenen hariç)
 * Servis "İşlemde" iken teklif onaylananın üstüne çıkmışsa (karar bekleyen
 * satır) yeni onay için "Müşteri onayı bekleniyor"a alır (SR-005).
 */
export async function refreshServiceTotals(ctx: ServiceContext, serviceId: string): Promise<Service> {
  return db.transaction(
    "rw",
    [
      db.services,
      db.service_operations,
      db.service_parts,
      db.service_status_history,
      db.sync_queue,
      db.audit_logs,
    ],
    async () => {
      const existing = await db.services.get(serviceId);
      if (!existing || existing.business_id !== ctx.businessId) {
        throw new ServiceRuleError("Servis bulunamadı.");
      }

      const [operations, parts] = await Promise.all([
        db.service_operations.where("service_id").equals(serviceId).toArray(),
        db.service_parts.where("service_id").equals(serviceId).toArray(),
      ]);
      const sumKurus = (rows: { line_total: number; status: Service["status"] | string }[]) =>
        rows
          .filter((r) => isBilled(r.status as never))
          .reduce((acc, r) => acc + toKurus(r.line_total), 0);

      const laborFee = fromKurus(sumKurus(operations));
      const totalAmount = fromKurus(sumKurus(operations) + sumKurus(parts));

      let current = existing;
      if (existing.labor_fee !== laborFee || existing.total_amount !== totalAmount) {
        current = { ...existing, labor_fee: laborFee, total_amount: totalAmount, updated_at: nowISO() };
        await db.services.put(current);
        await enqueue("services", serviceId, "UPDATE", updatePayload(current), ctx.deviceCode);
      }

      if (current.status === "IN_PROGRESS") {
        const summary = summarizeLines([...operations, ...parts]);
        if (needsApprovalBeforeWork(summary, ctx.approvalThreshold ?? DEFAULT_APPROVAL_THRESHOLD)) {
          return changeServiceStatus(
            ctx,
            serviceId,
            "WAITING_CUSTOMER_APPROVAL",
            "Teklif arttı; yeni müşteri onayı gerekli"
          );
        }
      }
      return current;
    }
  );
}
