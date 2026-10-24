import { db } from "@/lib/db";
import type {
  LineStatus,
  PartSourceType,
  PartSupplyStatus,
  Service,
  ServiceApproval,
  ServiceOperation,
  ServicePart,
} from "@/lib/db";
import { calcLine, fromKurus } from "@/lib/calc";
import { getProductBalance } from "@/lib/stock/ledger";
import { recordMovement } from "@/lib/stock/service";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import { isBilled, summarizeLines, approvalRequired } from "./lines";
import {
  DEFAULT_APPROVAL_THRESHOLD,
  ServiceRuleError,
  refreshServiceTotals,
  type ServiceContext,
} from "./service";
import type { TaxMode } from "@/types";

/** Satır eklenip değiştirilebilen durumlar; tamamlanmış servis önce yeniden açılmalıdır. */
export const EDITABLE_STATUSES = [
  "RECEIVED",
  "WAITING_DIAGNOSIS",
  "DIAGNOSED",
  "WAITING_CUSTOMER_APPROVAL",
  "IN_PROGRESS",
  "WAITING_PARTS",
];

const TABLES = () =>
  [
    db.services,
    db.service_operations,
    db.service_parts,
    db.service_approvals,
    db.service_status_history,
    db.products,
    db.stock_movements,
    db.sync_queue,
    db.audit_logs,
  ] as const;

async function loadEditableService(ctx: ServiceContext, serviceId: string): Promise<Service> {
  const service = await db.services.get(serviceId);
  if (!service || service.business_id !== ctx.businessId) {
    throw new ServiceRuleError("Servis bulunamadı.");
  }
  if (!EDITABLE_STATUSES.includes(service.status)) {
    throw new ServiceRuleError(
      "Bu durumdaki serviste kalem eklenemez veya değiştirilemez. Gerekirse servisi yeniden açın."
    );
  }
  return service;
}

type Money = {
  /** kuruş */
  unitPriceKurus: number;
  /** satırın toplam indirimi, kuruş */
  discountKurus: number;
  taxMode: TaxMode;
  taxRate: number;
  quantity: number;
};

function totalKurus(m: Money): number {
  return calcLine({
    unitPrice: m.unitPriceKurus,
    quantity: m.quantity,
    discount: m.discountKurus,
    taxMode: m.taxMode,
    taxRate: m.taxRate,
  }).total;
}

/** Onaylanmış satırın tutarı artarsa yeniden onay gerekir (SR-005, tolerans 0). */
function nextStatus(current: LineStatus, oldTotal: number, newTotal: number): LineStatus {
  return current === "APPROVED" && newTotal > oldTotal ? "PENDING" : current;
}

// ---------------------------------------------------------------- İşlem satırları

const OPERATION_COLUMNS = [
  "service_id",
  "description",
  "quantity",
  "unit_price",
  "discount_amount",
  "tax_mode",
  "tax_rate",
  "line_total",
  "price_pending",
  "status",
] as const;

function operationPayload(op: ServiceOperation, withCreatedAt: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: op.id, business_id: op.business_id };
  for (const c of OPERATION_COLUMNS) payload[c] = op[c] ?? null;
  if (withCreatedAt) payload.created_at = op.created_at;
  else payload.version = op.version ?? 1;
  return payload;
}

export type OperationInput = {
  description: string;
  quantity?: number;
  /** null: fiyat henüz bilinmiyor (SR-007) */
  unitPriceKurus: number | null;
  discountKurus?: number;
  taxMode: TaxMode;
  taxRate: number;
};

function buildOperationValues(input: OperationInput) {
  const description = input.description.trim();
  if (!description) throw new ServiceRuleError("İşlem açıklaması zorunludur.");
  const quantity = input.quantity ?? 1;
  const pricePending = input.unitPriceKurus === null;
  const unitPriceKurus = input.unitPriceKurus ?? 0;
  const discountKurus = input.discountKurus ?? 0;

  let lineKurus: number;
  try {
    lineKurus = totalKurus({ unitPriceKurus, discountKurus, taxMode: input.taxMode, taxRate: input.taxRate, quantity });
  } catch (e) {
    throw new ServiceRuleError(e instanceof Error ? e.message : "Tutar hesaplanamadı.");
  }
  return {
    description,
    quantity,
    unit_price: fromKurus(unitPriceKurus),
    discount_amount: fromKurus(discountKurus),
    tax_mode: input.taxMode,
    tax_rate: input.taxRate,
    line_total: fromKurus(lineKurus),
    price_pending: pricePending,
  };
}

export async function addOperation(
  ctx: ServiceContext,
  serviceId: string,
  input: OperationInput
): Promise<ServiceOperation> {
  return db.transaction("rw", [...TABLES()], async () => {
    await loadEditableService(ctx, serviceId);
    const now = nowISO();
    const op: ServiceOperation = {
      id: generateId(),
      business_id: ctx.businessId,
      service_id: serviceId,
      ...buildOperationValues(input),
      status: "PENDING",
      created_at: now,
      updated_at: now,
    };
    await db.service_operations.add(op);
    await enqueue("service_operations", op.id, "INSERT", operationPayload(op, true), ctx.deviceCode);
    await refreshServiceTotals(ctx, serviceId);
    return op;
  });
}

export async function updateOperation(
  ctx: ServiceContext,
  operationId: string,
  input: OperationInput
): Promise<ServiceOperation> {
  return db.transaction("rw", [...TABLES()], async () => {
    const existing = await db.service_operations.get(operationId);
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new ServiceRuleError("İşlem satırı bulunamadı.");
    }
    await loadEditableService(ctx, existing.service_id);

    const values = buildOperationValues(input);
    const next: ServiceOperation = {
      ...existing,
      ...values,
      status: nextStatus(existing.status, existing.line_total, values.line_total),
      updated_at: nowISO(),
    };
    await db.service_operations.put(next);
    await enqueue("service_operations", next.id, "UPDATE", operationPayload(next, false), ctx.deviceCode);
    await refreshServiceTotals(ctx, existing.service_id);
    return next;
  });
}

export async function removeOperation(ctx: ServiceContext, operationId: string): Promise<void> {
  await db.transaction("rw", [...TABLES()], async () => {
    const existing = await db.service_operations.get(operationId);
    if (!existing || existing.business_id !== ctx.businessId) {
      throw new ServiceRuleError("İşlem satırı bulunamadı.");
    }
    await loadEditableService(ctx, existing.service_id);
    await db.service_operations.delete(operationId);
    await enqueue("service_operations", operationId, "DELETE", operationPayload(existing, false), ctx.deviceCode);
    await refreshServiceTotals(ctx, existing.service_id);
  });
}

// ---------------------------------------------------------------- Parça satırları

const PART_COLUMNS = [
  "service_id",
  "product_id",
  "description_snapshot",
  "quantity",
  "unit",
  "unit_price_snapshot",
  "unit_cost_snapshot",
  "source_type",
  "status",
  "used_quantity",
  "supply_status",
  "expected_at",
  "discount_amount",
  "tax_mode",
  "tax_rate",
  "line_total",
  "stock_movement_id",
  "approved_at",
  "approved_amount",
] as const;

function partPayload(part: ServicePart, withCreatedAt: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: part.id, business_id: part.business_id };
  for (const c of PART_COLUMNS) payload[c] = part[c] ?? null;
  if (withCreatedAt) payload.created_at = part.created_at;
  else payload.version = part.version ?? 1;
  return payload;
}

export type PartInput = {
  sourceType: PartSourceType;
  /** STOCK_PRODUCT için zorunlu */
  productId?: string;
  /** Stok dışı parçalarda zorunlu */
  description?: string;
  quantity: number;
  /** kuruş; stok ürününde boşsa ürünün satış fiyatı alınır */
  unitPriceKurus?: number;
  discountKurus?: number;
  taxMode?: TaxMode;
  taxRate?: number;
};

export async function addPart(
  ctx: ServiceContext,
  serviceId: string,
  input: PartInput
): Promise<ServicePart> {
  if (!(input.quantity > 0)) throw new ServiceRuleError("Miktar sıfırdan büyük olmalıdır.");

  return db.transaction("rw", [...TABLES()], async () => {
    await loadEditableService(ctx, serviceId);

    let description = input.description?.trim() ?? "";
    let unit = "ADET";
    let unitPriceKurus = input.unitPriceKurus;
    let unitCost = 0;
    let taxMode: TaxMode = input.taxMode ?? "INCLUSIVE";
    let taxRate = input.taxRate ?? 20;
    let supply: PartSupplyStatus = "IN_STOCK";
    let productId: string | undefined;

    if (input.sourceType === "STOCK_PRODUCT") {
      const product = input.productId ? await db.products.get(input.productId) : undefined;
      if (!product || product.business_id !== ctx.businessId) throw new ServiceRuleError("Ürün bulunamadı.");
      if (product.archived_at) throw new ServiceRuleError("Pasif ürün servise eklenemez.");
      if (product.is_serial_tracked) {
        throw new ServiceRuleError("Seri takipli ürünler (makineler) servis parçası olarak eklenemez.");
      }
      productId = product.id;
      description = product.name;
      unit = product.unit;
      unitCost = product.last_purchase_price ?? 0;
      if (unitPriceKurus === undefined) unitPriceKurus = Math.round(product.default_sale_price * 100);
      if (input.taxMode === undefined) taxMode = product.default_tax_mode;
      if (input.taxRate === undefined) taxRate = product.default_tax_rate;
      const { available } = await getProductBalance(product.id);
      supply = available >= input.quantity ? "IN_STOCK" : "TO_ORDER";
    } else {
      if (!description) throw new ServiceRuleError("Parça açıklaması zorunludur.");
      if (unitPriceKurus === undefined) {
        if (input.sourceType !== "CUSTOMER_SUPPLIED") throw new ServiceRuleError("Parça fiyatı zorunludur.");
        unitPriceKurus = 0; // müşterinin getirdiği parçada bedel yazılmayabilir (§7.1)
      }
    }

    let lineKurus: number;
    try {
      lineKurus = totalKurus({
        unitPriceKurus: unitPriceKurus as number,
        discountKurus: input.discountKurus ?? 0,
        taxMode,
        taxRate,
        quantity: input.quantity,
      });
    } catch (e) {
      throw new ServiceRuleError(e instanceof Error ? e.message : "Tutar hesaplanamadı.");
    }

    const now = nowISO();
    const part: ServicePart = {
      id: generateId(),
      business_id: ctx.businessId,
      service_id: serviceId,
      product_id: productId,
      description_snapshot: description,
      quantity: input.quantity,
      unit,
      unit_price_snapshot: fromKurus(unitPriceKurus as number),
      unit_cost_snapshot: unitCost,
      source_type: input.sourceType,
      status: "PENDING",
      used_quantity: 0,
      supply_status: supply,
      discount_amount: fromKurus(input.discountKurus ?? 0),
      tax_mode: taxMode,
      tax_rate: taxRate,
      line_total: fromKurus(lineKurus),
      created_at: now,
      updated_at: now,
    };
    await db.service_parts.add(part);
    await enqueue("service_parts", part.id, "INSERT", partPayload(part, true), ctx.deviceCode);
    await refreshServiceTotals(ctx, serviceId);
    return part;
  });
}

export async function updatePart(
  ctx: ServiceContext,
  partId: string,
  patch: { quantity?: number; unitPriceKurus?: number; discountKurus?: number; supplyStatus?: PartSupplyStatus }
): Promise<ServicePart> {
  return db.transaction("rw", [...TABLES()], async () => {
    const existing = await db.service_parts.get(partId);
    if (!existing || existing.business_id !== ctx.businessId) throw new ServiceRuleError("Parça satırı bulunamadı.");
    await loadEditableService(ctx, existing.service_id);

    const quantity = patch.quantity ?? existing.quantity;
    if (!(quantity > 0)) throw new ServiceRuleError("Miktar sıfırdan büyük olmalıdır.");
    if (quantity < existing.used_quantity) {
      throw new ServiceRuleError("Miktar, kullanılan miktarın altına indirilemez.");
    }
    const unitPriceKurus = patch.unitPriceKurus ?? Math.round(existing.unit_price_snapshot * 100);
    const discountKurus = patch.discountKurus ?? Math.round(existing.discount_amount * 100);

    let lineKurus: number;
    try {
      lineKurus = totalKurus({
        unitPriceKurus,
        discountKurus,
        taxMode: existing.tax_mode as TaxMode,
        taxRate: existing.tax_rate,
        quantity,
      });
    } catch (e) {
      throw new ServiceRuleError(e instanceof Error ? e.message : "Tutar hesaplanamadı.");
    }

    const next: ServicePart = {
      ...existing,
      quantity,
      unit_price_snapshot: fromKurus(unitPriceKurus),
      discount_amount: fromKurus(discountKurus),
      line_total: fromKurus(lineKurus),
      supply_status: patch.supplyStatus ?? existing.supply_status,
      status: nextStatus(existing.status, existing.line_total, fromKurus(lineKurus)),
      updated_at: nowISO(),
    };
    await db.service_parts.put(next);
    await enqueue("service_parts", next.id, "UPDATE", partPayload(next, false), ctx.deviceCode);
    await refreshServiceTotals(ctx, existing.service_id);
    return next;
  });
}

/**
 * Parçanın temin durumunu ve beklenen geliş tarihini günceller (SR-019). Teklif
 * tutarını değiştirmez; kapanmış (teslim/iptal) serviste yapılamaz.
 */
export async function setPartSupply(
  ctx: ServiceContext,
  partId: string,
  supplyStatus: PartSupplyStatus,
  expectedAt?: string
): Promise<ServicePart> {
  if (expectedAt && !/^\d{4}-\d{2}-\d{2}$/.test(expectedAt)) throw new ServiceRuleError("Beklenen tarih geçersiz.");
  return db.transaction("rw", [...TABLES()], async () => {
    const existing = await db.service_parts.get(partId);
    if (!existing || existing.business_id !== ctx.businessId) throw new ServiceRuleError("Parça satırı bulunamadı.");
    const service = await db.services.get(existing.service_id);
    if (!service || ["DELIVERED", "CANCELLED"].includes(service.status)) {
      throw new ServiceRuleError("Teslim edilmiş veya iptal edilmiş serviste temin durumu değiştirilemez.");
    }
    const next: ServicePart = {
      ...existing,
      supply_status: supplyStatus,
      expected_at: supplyStatus === "TO_ORDER" || supplyStatus === "ORDERED" ? expectedAt : undefined,
      updated_at: nowISO(),
    };
    await db.service_parts.put(next);
    await enqueue("service_parts", next.id, "UPDATE", partPayload(next, false), ctx.deviceCode);
    return next;
  });
}

export async function removePart(ctx: ServiceContext, partId: string): Promise<void> {
  await db.transaction("rw", [...TABLES()], async () => {
    const existing = await db.service_parts.get(partId);
    if (!existing || existing.business_id !== ctx.businessId) throw new ServiceRuleError("Parça satırı bulunamadı.");
    await loadEditableService(ctx, existing.service_id);
    if (existing.used_quantity > 0) {
      throw new ServiceRuleError("Kullanılmış parça kaldırılamaz. Önce kullanımı geri alın.");
    }
    await db.service_parts.delete(partId);
    await enqueue("service_parts", partId, "DELETE", partPayload(existing, false), ctx.deviceCode);
    await refreshServiceTotals(ctx, existing.service_id);
  });
}

/**
 * Parçanın kullanılan miktarını ayarlar. Stoktan düşüm yalnızca burada, yani
 * parça gerçekten kullanıldığında olur (SR-008); teklif aşamasında stok
 * değişmez (TC-006). Stok ürünü için SERVICE_USE hareketi yazılır, maliyet
 * snapshot'ı hareketle birlikte saklanır (AC-050). Azaltma, ters hareketle
 * (CANCEL_REVERSAL) yapılır ve neden ister.
 */
export async function setPartUsedQuantity(
  ctx: ServiceContext,
  partId: string,
  newUsed: number,
  reason?: string
): Promise<ServicePart> {
  return db.transaction("rw", [...TABLES()], async () => {
    const part = await db.service_parts.get(partId);
    if (!part || part.business_id !== ctx.businessId) throw new ServiceRuleError("Parça satırı bulunamadı.");
    const service = await db.services.get(part.service_id);
    if (!service) throw new ServiceRuleError("Servis bulunamadı.");

    if (service.status !== "IN_PROGRESS") {
      throw new ServiceRuleError("Parça yalnızca “İşlemde” durumundaki serviste kullanılabilir.");
    }
    if (part.status === "REJECTED" || part.status === "DEFERRED") {
      throw new ServiceRuleError("Müşterinin reddettiği veya ertelediği parça kullanılamaz.");
    }
    if (!(newUsed >= 0) || newUsed > part.quantity) {
      throw new ServiceRuleError("Kullanılan miktar 0 ile teklif miktarı arasında olmalıdır.");
    }

    const delta = Math.round((newUsed - part.used_quantity) * 10000) / 10000;
    if (delta === 0) return part;

    if (delta > 0 && part.status === "PENDING") {
      const [ops, parts] = await Promise.all([
        db.service_operations.where("service_id").equals(service.id).toArray(),
        db.service_parts.where("service_id").equals(service.id).toArray(),
      ]);
      const summary = summarizeLines([...ops, ...parts]);
      if (approvalRequired(summary.quote, ctx.approvalThreshold ?? DEFAULT_APPROVAL_THRESHOLD)) {
        throw new ServiceRuleError("Müşteri onayı gerekli: parça onaylanmadan kullanılamaz.");
      }
    }
    if (delta < 0 && !reason?.trim()) {
      throw new ServiceRuleError("Kullanımı geri almak için neden zorunludur.");
    }

    let movementId = part.stock_movement_id;
    if (part.source_type === "STOCK_PRODUCT" && part.product_id) {
      const movement = await recordMovement(ctx, {
        productId: part.product_id,
        type: delta > 0 ? "SERVICE_USE" : "CANCEL_REVERSAL",
        quantity: -delta,
        unitCost: part.unit_cost_snapshot,
        sourceType: "SERVICE_PART",
        sourceId: part.id,
        note: delta > 0 ? service.document_no : `${service.document_no}: ${reason?.trim()}`,
      });
      movementId ??= movement.id;
    }

    const next: ServicePart = {
      ...part,
      used_quantity: newUsed,
      stock_movement_id: movementId,
      updated_at: nowISO(),
    };
    await db.service_parts.put(next);
    await enqueue("service_parts", next.id, "UPDATE", partPayload(next, false), ctx.deviceCode);
    return next;
  });
}

// ---------------------------------------------------------------- Müşteri onayı

export type LineDecision = {
  kind: "operation" | "part";
  id: string;
  decision: Exclude<LineStatus, "PENDING">;
};

/**
 * Müşteri kararını kaydeder (§6, SR-005/006, AC-004, AC-042). Her kalem için
 * onaylandı / reddedildi / ertelendi; kayıt değiştirilemez onay geçmişine
 * (kim, ne zaman, hangi yöntemle, o anki onaylı tutar) yazılır. Kullanılmış
 * parça reddedilemez veya ertelenemez.
 */
export async function recordApproval(
  ctx: ServiceContext,
  serviceId: string,
  params: { decisions: LineDecision[]; method: ServiceApproval["method"]; explanation?: string }
): Promise<ServiceApproval> {
  if (params.decisions.length === 0) throw new ServiceRuleError("En az bir kalem için karar verin.");

  return db.transaction("rw", [...TABLES()], async () => {
    await loadEditableService(ctx, serviceId);
    const now = nowISO();

    for (const d of params.decisions) {
      if (d.kind === "operation") {
        const op = await db.service_operations.get(d.id);
        if (!op || op.service_id !== serviceId) throw new ServiceRuleError("İşlem satırı bulunamadı.");
        const next: ServiceOperation = { ...op, status: d.decision, updated_at: now };
        await db.service_operations.put(next);
        await enqueue("service_operations", op.id, "UPDATE", operationPayload(next, false), ctx.deviceCode);
      } else {
        const part = await db.service_parts.get(d.id);
        if (!part || part.service_id !== serviceId) throw new ServiceRuleError("Parça satırı bulunamadı.");
        if (part.used_quantity > 0 && (d.decision === "REJECTED" || d.decision === "DEFERRED")) {
          throw new ServiceRuleError(`“${part.description_snapshot}” kullanılmış; reddedilemez veya ertelenemez.`);
        }
        const next: ServicePart = {
          ...part,
          status: d.decision,
          approved_at: d.decision === "APPROVED" ? now : part.approved_at,
          approved_amount: d.decision === "APPROVED" ? part.line_total : part.approved_amount,
          updated_at: now,
        };
        await db.service_parts.put(next);
        await enqueue("service_parts", part.id, "UPDATE", partPayload(next, false), ctx.deviceCode);
      }
    }

    await refreshServiceTotals(ctx, serviceId);

    const [ops, parts] = await Promise.all([
      db.service_operations.where("service_id").equals(serviceId).toArray(),
      db.service_parts.where("service_id").equals(serviceId).toArray(),
    ]);
    const approvedKurus = summarizeLines([...ops, ...parts]).approved;

    const kinds = new Set(params.decisions.map((d) => d.decision));
    const approval: ServiceApproval = {
      id: generateId(),
      business_id: ctx.businessId,
      service_id: serviceId,
      decision: kinds.size === 1 ? (params.decisions[0].decision as ServiceApproval["decision"]) : "PARTIAL",
      method: params.method,
      approved_amount: fromKurus(approvedKurus),
      explanation: params.explanation?.trim() || undefined,
      actor_id: ctx.actorId,
      changed_by_device: ctx.deviceCode,
      decided_at: now,
    };
    await db.service_approvals.add(approval);
    await enqueue(
      "service_approvals",
      approval.id,
      "INSERT",
      {
        id: approval.id,
        business_id: approval.business_id,
        service_id: approval.service_id,
        decision: approval.decision,
        method: approval.method,
        approved_amount: approval.approved_amount,
        explanation: approval.explanation ?? null,
        actor_id: approval.actor_id ?? null,
        changed_by_device: approval.changed_by_device,
        decided_at: approval.decided_at,
      },
      ctx.deviceCode
    );
    return approval;
  });
}

/** Servisin tüm satırları (ekran için). */
export async function getServiceLines(serviceId: string) {
  const [operations, parts] = await Promise.all([
    db.service_operations.where("service_id").equals(serviceId).toArray(),
    db.service_parts.where("service_id").equals(serviceId).toArray(),
  ]);
  const byCreated = <T extends { created_at: string }>(rows: T[]) =>
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { operations: byCreated(operations), parts: byCreated(parts) };
}

export { isBilled };
