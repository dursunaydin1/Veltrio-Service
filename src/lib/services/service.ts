import { db } from "@/lib/db";
import type { Service } from "@/lib/db";
import { CALC_VERSION, fromKurus, toKurus } from "@/lib/calc";
import { getAllocatedKurus } from "@/lib/finance/allocated";
import { recordCustomerPayment } from "@/lib/finance/service";
import { createMachine } from "@/lib/machines/service";
import { nextDocumentNo } from "@/lib/numbering";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { Payment, PaymentMethod } from "@/types";
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
  /** Onaylı satırda bu tutara (TL) kadar artış yeniden onay istemez; varsayılan 0 */
  approvalTolerance?: number;
  allowNegativeStock?: boolean;
};

export const DEFAULT_APPROVAL_THRESHOLD = 1000;

/** İş tamamlanırken zorunlu kontrol listesi maddeleri açık: kullanıcı onaylarsa devam edilebilir. */
export class ChecklistIncompleteError extends Error {
  constructor(public readonly titles: string[]) {
    super(`Tamamlanmamış zorunlu madde var: ${titles.join(", ")}`);
    this.name = "ChecklistIncompleteError";
  }
}

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
  "warranty_source",
  "warranty_coverage",
  "cancel_reason",
  "cancel_fee",
  "existing_damage",
  "received_accessories",
  "delivered_to",
  "delivery_balance",
  "debt_acknowledged",
  "due_date",
  "intake_photo",
  "calc_version",
  "created_by_device",
  "created_at",
] as const;

/** Güncellemede belge no, müşteri, makine ve kabul bilgisi (değişmez alanlar) gönderilmez. */
const UPDATE_COLUMNS = INSERT_COLUMNS.filter(
  (c) =>
    !["customer_id", "machine_id", "document_no", "received_date", "intake_photo", "created_by_device", "created_at"].includes(c)
);

/** Boş alanlar `null` gönderilir; aksi halde sunucu eski değeri korur. */
function payloadOf(service: Service, columns: readonly (keyof Service)[]): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: service.id, business_id: service.business_id };
  for (const column of columns) payload[column] = service[column] ?? null;
  // Sunucuda NOT NULL DEFAULT FALSE: açıkça null gönderilirse varsayılan uygulanmaz ve kayıt reddedilir.
  if (columns.includes("debt_acknowledged")) payload.debt_acknowledged = service.debt_acknowledged ?? false;
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
  /** Kabul fotoğrafı (JPEG data URL, ≤1200px) */
  photo?: string;
  /** Garanti talebi (SR-011): kaynak ve kapsam açıklaması isteğe bağlı */
  warranty?: { source?: string; coverage?: string };
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
        intake_photo: params.photo || undefined,
        is_warranty_claim: !!params.warranty,
        warranty_source: tidy(params.warranty?.source),
        warranty_coverage: tidy(params.warranty?.coverage),
        calc_version: CALC_VERSION,
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
  note?: string,
  options: { ignoreChecklist?: boolean; diagnosticFeeKurus?: number } = {}
): Promise<Service> {
  return db.transaction(
    "rw",
    [
      db.services,
      db.service_status_history,
      db.service_checklist_items,
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
      if (to === "COMPLETED" && !options.ignoreChecklist) {
        const open = (await db.service_checklist_items.where("service_id").equals(serviceId).toArray())
          .filter((i) => i.required && !i.is_completed)
          .sort((a, b) => a.sort_order - b.sort_order);
        if (open.length > 0) throw new ChecklistIncompleteError(open.map((i) => i.title_snapshot));
      }
      if (to === "COMPLETED") {
        const summary = await loadQuoteSummary(serviceId);
        if (summary.unpriced > 0) {
          throw new ServiceRuleError("Fiyatı belirlenmemiş kalem var. Tüm kalemlere fiyat girin veya kaldırın.");
        }
        // Stoktan faturalanan parça kullanıldı olarak işaretlenmeden iş bitmez;
        // aksi halde müşteriye parça bedeli yazılır ama stok düşmez (ST-005).
        const parts = await db.service_parts.where("service_id").equals(serviceId).toArray();
        const unconsumed = parts.filter(
          (p) => isBilled(p.status) && p.source_type === "STOCK_PRODUCT" && p.used_quantity < p.quantity
        );
        if (unconsumed.length > 0) {
          throw new ServiceRuleError(
            `Faturalanan parça kullanıldı olarak işaretlenmemiş (stok düşmedi): ${unconsumed
              .map((p) => p.description_snapshot)
              .join(", ")}. “Kullanımı kaydedin” ya da miktarı/parçayı düzeltin.`
          );
        }
      }

      const now = nowISO();
      const next: Service = { ...existing, status: to, updated_at: now };
      if (to === "COMPLETED") {
        next.completed_date = now;
        next.first_completed_at = existing.first_completed_at ?? now;
      }
      if (to === "DELIVERED") next.delivered_date = now;
      if (to === "CANCELLED") {
        next.cancel_reason = why;
        const fee = options.diagnosticFeeKurus;
        if (fee !== undefined) {
          if (!Number.isInteger(fee) || fee < 0) throw new ServiceRuleError("İnceleme ücreti geçersiz.");
          next.cancel_fee = fee > 0 ? fromKurus(fee) : undefined;
        }
      }
      if (isReopen(from, to)) {
        next.completed_date = undefined;
        next.delivered_date = undefined;
        next.delivered_to = undefined;
        next.delivery_balance = undefined;
        next.debt_acknowledged = false;
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
  /** Garanti talebi bayrağı, kaynağı ve kapsam açıklaması */
  is_warranty_claim?: boolean;
  warranty_source?: string;
  warranty_coverage?: string;
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
      is_warranty_claim: details.is_warranty_claim ?? existing.is_warranty_claim,
      warranty_source: details.is_warranty_claim === false ? undefined : tidy(details.warranty_source) ?? existing.warranty_source,
      warranty_coverage: details.is_warranty_claim === false ? undefined : tidy(details.warranty_coverage) ?? existing.warranty_coverage,
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
      db.service_checklist_items,
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

// ---------------------------------------------------------------- Ödeme ve teslim

/** Servise bağlı ödemeler (kapora, teslimde veya sonradan alınan tahsilatlar ve ters kayıtları). */
export async function getServicePayments(serviceId: string): Promise<Payment[]> {
  return db.payments
    .where("source_id")
    .equals(serviceId)
    .filter((p) => p.source_type === "SERVICE")
    .toArray();
}

export type ServiceBalance = {
  /** Faturalanan servis tutarı (iadeler düşülmüş; iptal edilmiş serviste 0), kuruş */
  total: number;
  /** Servisten düşülen iade / ücret düzeltmesi, kuruş */
  returned: number;
  /** Tahsil edilen net tutar (tahsilat − iade/ters kayıt), kuruş */
  paid: number;
  /** total − paid; pozitif: müşteri borçlu, negatif: fazla ödeme */
  remaining: number;
};

/** Servisin kalan bakiyesi (§5.2): tutar − servise bağlı net ödemeler. */
export async function getServiceBalance(serviceId: string): Promise<ServiceBalance> {
  const [service, payments, returns] = await Promise.all([
    db.services.get(serviceId),
    getServicePayments(serviceId),
    db.return_transactions
      .where("original_id")
      .equals(serviceId)
      .filter((r) => r.original_type === "SERVICE" && r.status === "POSTED")
      .toArray(),
  ]);
  const returned = returns.reduce((acc, r) => acc + toKurus(r.total_amount), 0);
  // İptal edilmiş servis müşteriye yazılmaz; yalnızca iptalde alınan inceleme/teşhis ücreti borç olur.
  // Alınan kapora fazla ödeme olarak kalır.
  const total =
    service?.status === "CANCELLED" ? toKurus(service.cancel_fee ?? 0) - returned : toKurus(service?.total_amount ?? 0) - returned;
  const paid =
    payments.reduce((acc, p) => acc + (p.direction === "IN" ? 1 : -1) * toKurus(p.amount), 0) +
    (await getAllocatedKurus("SERVICE", serviceId));
  return { total, paid, returned, remaining: total - paid };
}

function dueDateOf(date?: string): string | undefined {
  if (!date) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ServiceRuleError("Vade tarihi geçersiz.");
  return date;
}

export type DeliveryParams = {
  /** Teslimde alınan tahsilat */
  payment?: { amountKurus: number; method: PaymentMethod };
  /** Teslim alan kişi; müşterinin kendisi değilse adı */
  receiverName?: string;
  /** Kalan bakiye varsa müşterinin borcu kabul ettiği (AC-025) */
  debtAcknowledged?: boolean;
  /** Borçlu teslimde söz verilen ödeme tarihi (YYYY-MM-DD, isteğe bağlı) */
  dueDate?: string;
};

/**
 * Servisi teslim eder (§5.2): "İş tamamlandı" durumundaki servis; teslimde
 * tahsilat alınabilir. Kalan bakiye varsa (borçlu teslim) müşterinin borcu
 * kabulü işaretlenmeden teslim edilemez; kalan tutar, teslim alan kişi ve
 * kabul servise yazılır. Tahsilat, durum değişimi ve teslim bilgileri tek
 * işlemdedir: teslim reddedilirse tahsilat da kaydedilmez.
 */
export async function deliverService(
  ctx: ServiceContext,
  serviceId: string,
  params: DeliveryParams = {}
): Promise<Service> {
  return db.transaction(
    "rw",
    [
      db.services,
      db.customers,
      db.payments,
      db.payment_allocations,
      db.return_transactions,
      db.service_checklist_items,
      db.service_operations,
      db.service_parts,
      db.service_status_history,
      db.sync_queue,
      db.audit_logs,
    ],
    async () => {
      const service = await db.services.get(serviceId);
      if (!service || service.business_id !== ctx.businessId) {
        throw new ServiceRuleError("Servis bulunamadı.");
      }
      if (service.status !== "COMPLETED") {
        throw new ServiceRuleError("Yalnızca “İş tamamlandı” durumundaki servis teslim edilebilir.");
      }
      if (!service.customer_id) throw new ServiceRuleError("Serviste müşteri bilgisi yok.");

      if (params.payment) {
        await recordCustomerPayment(ctx, {
          customerId: service.customer_id,
          direction: "IN",
          method: params.payment.method,
          amountKurus: params.payment.amountKurus,
          note: `Teslim tahsilatı (${service.document_no})`,
          sourceType: "SERVICE",
          sourceId: serviceId,
        });
      }

      const { remaining } = await getServiceBalance(serviceId);
      const indebted = remaining > 0;
      if (indebted && !params.debtAcknowledged) {
        throw new ServiceRuleError(
          `Kalan bakiye ${fromKurus(remaining).toFixed(2).replace(".", ",")} ₺. Tahsilat alın veya müşterinin borcu kabul ettiğini işaretleyin.`
        );
      }

      const receiver = params.receiverName?.trim() || undefined;
      const note = [
        receiver ? `Teslim alan: ${receiver}` : undefined,
        indebted ? `Borçlu teslim: kalan ${fromKurus(remaining).toFixed(2).replace(".", ",")} ₺ (müşteri borcu kabul etti)` : undefined,
      ]
        .filter(Boolean)
        .join(" · ");

      const delivered = await changeServiceStatus(ctx, serviceId, "DELIVERED", note || undefined);
      const next: Service = {
        ...delivered,
        delivered_to: receiver,
        delivery_balance: fromKurus(Math.max(remaining, 0)),
        debt_acknowledged: indebted && !!params.debtAcknowledged,
        due_date: indebted ? dueDateOf(params.dueDate) : undefined,
      };
      await db.services.put(next);
      await enqueue("services", serviceId, "UPDATE", updatePayload(next), ctx.deviceCode);
      return next;
    }
  );
}

/**
 * Servise bağlı tahsilat (kapora dışı, sonradan alınan ödeme). İptal edilmiş
 * serviste de alınabilir; iade veya mahsup müşteri sayfasından yapılır.
 */
export async function collectServicePayment(
  ctx: ServiceContext,
  serviceId: string,
  params: { amountKurus: number; method: PaymentMethod; note?: string }
): Promise<Payment> {
  return db.transaction("rw", [db.services, db.customers, db.payments, db.sync_queue], async () => {
    const service = await db.services.get(serviceId);
    if (!service || service.business_id !== ctx.businessId) {
      throw new ServiceRuleError("Servis bulunamadı.");
    }
    if (!service.customer_id) throw new ServiceRuleError("Serviste müşteri bilgisi yok.");
    return recordCustomerPayment(ctx, {
      customerId: service.customer_id,
      direction: "IN",
      method: params.method,
      amountKurus: params.amountKurus,
      note: params.note?.trim() || `Tahsilat (${service.document_no})`,
      sourceType: "SERVICE",
      sourceId: serviceId,
    });
  });
}
