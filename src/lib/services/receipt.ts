import { db } from "@/lib/db";
import type { LineStatus, Service, ServiceOperation, ServicePart } from "@/lib/db";
import { fromKurus } from "@/lib/calc";
import { machineTitleOf } from "@/lib/machines/title";
import type { Business, Customer, Machine } from "@/types";
import { isBilled } from "./lines";
import { getServiceBalance, type ServiceBalance } from "./service";
import { statusLabel } from "./status";

export type ReceiptType = "intake" | "summary";

/**
 * Müşteriye verilen çıktının satırı. Bilerek yalnızca müşteriye gösterilecek
 * alanları içerir: parça maliyet snapshot'ı (unit_cost_snapshot) ve stok
 * bilgisi bu modelde yoktur, dolayısıyla çıktıda görünemez (AC-034).
 */
export type ReceiptLine = {
  kind: "İşlem" | "Parça";
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: LineStatus;
};

export type ReceiptModel = {
  type: ReceiptType;
  title: string;
  business: { name: string; phone?: string; address?: string };
  documentNo: string;
  receivedDate: string;
  statusText: string;
  customer: { name: string; phone?: string; village?: string };
  machine: { title: string; type: string; identifier: string };
  complaint?: string;
  existingDamage?: string;
  accessories?: string;
  promisedDate?: string;
  /** Garanti talebi: kaynak ve kapsam açıklaması (fişte "Garanti kapsamında" olarak görünür) */
  warranty?: { source?: string; coverage?: string };
  /** Kabulde alınan kapora (TL) */
  deposit: number;
  /** Yalnızca sonuç özetinde */
  diagnosis?: string;
  resolution?: string;
  lines: ReceiptLine[];
  total: number;
  paid: number;
  remaining: number;
  delivery?: { date?: string; to?: string; debtBalance: number; debtAcknowledged: boolean };
  terms: string;
  disclaimer: string;
};

export const RECEIPT_DEFAULT_TERMS =
  "Cihaz, bildirilen şikâyet kapsamında incelenmek üzere teslim alınmıştır. Onaylanan işlemler dışında " +
  "işlem yapılmaz. Tamamlandığı bildirilen cihazın 30 gün içinde teslim alınması rica olunur.";

export const RECEIPT_DISCLAIMER = "Bu belge resmî fatura yerine geçmez.";

export type ReceiptSource = {
  business: Pick<Business, "name" | "phone" | "address" | "settings">;
  service: Service;
  customer?: Pick<Customer, "name" | "phone" | "village">;
  machine?: Pick<Machine, "type" | "brand" | "model" | "serial_number" | "internal_number">;
  operations: ServiceOperation[];
  parts: ServicePart[];
  balance: ServiceBalance;
};

const orUndefined = (v?: string | null) => (v && v.trim() ? v.trim() : undefined);

/** Kabul fişi veya sonuç özeti için müşteriye gösterilecek veriyi hazırlar. */
export function buildReceiptModel(type: ReceiptType, src: ReceiptSource): ReceiptModel {
  const { service, machine } = src;

  const lines: ReceiptLine[] =
    type === "summary"
      ? [
          ...src.operations
            .filter((o) => isBilled(o.status))
            .map((o) => ({
              kind: "İşlem" as const,
              description: o.description,
              quantity: o.quantity,
              unitPrice: o.unit_price,
              total: o.line_total,
              status: o.status,
            })),
          ...src.parts
            .filter((p) => isBilled(p.status))
            .map((p) => ({
              kind: "Parça" as const,
              description: p.description_snapshot,
              quantity: p.quantity,
              unitPrice: p.unit_price_snapshot,
              total: p.line_total,
              status: p.status,
            })),
        ]
      : [];

  const identifier = [
    machine?.serial_number ? `Seri no: ${machine.serial_number}` : undefined,
    machine?.internal_number ? `İç no: ${machine.internal_number}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    type,
    title: type === "intake" ? "Servis Kabul Fişi" : "Servis Sonuç Özeti",
    business: {
      name: src.business.name,
      phone: orUndefined(src.business.phone),
      address: orUndefined(src.business.address),
    },
    documentNo: service.document_no,
    receivedDate: service.received_date,
    statusText: statusLabel(service.status),
    customer: {
      name: src.customer?.name ?? "—",
      phone: orUndefined(src.customer?.phone),
      village: orUndefined(src.customer?.village),
    },
    machine: {
      title: machine ? machineTitleOf(machine) : "—",
      type: machine?.type ?? "",
      identifier,
    },
    complaint: orUndefined(service.customer_complaint),
    existingDamage: orUndefined(service.existing_damage),
    accessories: orUndefined(service.received_accessories),
    promisedDate: service.promised_date || undefined,
    warranty: service.is_warranty_claim
      ? { source: orUndefined(service.warranty_source), coverage: orUndefined(service.warranty_coverage) }
      : undefined,
    deposit: service.deposit_amount,
    diagnosis: type === "summary" ? orUndefined(service.diagnosis) : undefined,
    resolution: type === "summary" ? orUndefined(service.resolution) : undefined,
    lines,
    total: fromKurus(src.balance.total),
    paid: fromKurus(src.balance.paid),
    remaining: fromKurus(Math.max(src.balance.remaining, 0)),
    delivery:
      type === "summary" && service.status === "DELIVERED"
        ? {
            date: service.delivered_date,
            to: orUndefined(service.delivered_to),
            debtBalance: service.delivery_balance ?? 0,
            debtAcknowledged: !!service.debt_acknowledged,
          }
        : undefined,
    terms: orUndefined(src.business.settings?.receipt_terms) ?? RECEIPT_DEFAULT_TERMS,
    disclaimer: RECEIPT_DISCLAIMER,
  };
}

/** Servisin fiş verisini yerel veritabanından yükler. */
export async function loadReceiptSource(
  serviceId: string,
  business: ReceiptSource["business"]
): Promise<ReceiptSource | undefined> {
  const service = await db.services.get(serviceId);
  if (!service) return undefined;

  const [customer, machine, operations, parts, balance] = await Promise.all([
    service.customer_id ? db.customers.get(service.customer_id) : undefined,
    service.machine_id ? db.machines.get(service.machine_id) : undefined,
    db.service_operations.where("service_id").equals(serviceId).toArray(),
    db.service_parts.where("service_id").equals(serviceId).toArray(),
    getServiceBalance(serviceId),
  ]);
  return { business, service, customer, machine, operations, parts, balance };
}
