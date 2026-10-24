import { db } from "@/lib/db";
import { getBalances } from "@/lib/stock/ledger";
import { machineTitleOf } from "@/lib/machines/title";
import { isOpenStatus, statusLabel } from "@/lib/services/status";
import { todayLocalDate } from "@/lib/utils";
import {
  activeServicesReport,
  collectionsReport,
  customerStatement,
  localDate,
  machineHistoryReport,
  salesReport,
  serviceRevenueReport,
  stockReport,
  type ActiveServiceFilter,
  type ActiveServiceRow,
  type DateRange,
  type Granularity,
} from "./calc";
import { daysOverdue } from "@/lib/finance/aging";

/** Rapor verilerini yerel veritabanından yükler (çevrimdışı da çalışır) ve saf hesaplara verir. */

export async function loadSalesReport(businessId: string, range: DateRange, granularity: Granularity) {
  const [sales, returns] = await Promise.all([
    db.sales.where("business_id").equals(businessId).toArray(),
    db.return_transactions.where("business_id").equals(businessId).toArray(),
  ]);
  return salesReport(sales, returns, range, granularity);
}

export async function loadCollections(businessId: string, range: DateRange, granularity: Granularity) {
  const payments = await db.payments.where("business_id").equals(businessId).toArray();
  return collectionsReport(payments, range, granularity);
}

export async function loadServiceRevenue(businessId: string, range: DateRange, granularity: Granularity) {
  const [services, returns, history] = await Promise.all([
    db.services.where("business_id").equals(businessId).toArray(),
    db.return_transactions.where("business_id").equals(businessId).toArray(),
    db.service_status_history.where("business_id").equals(businessId).filter((h) => h.to_status === "CANCELLED").toArray(),
  ]);
  const cancelDates = new Map<string, string>();
  for (const h of history) {
    const prev = cancelDates.get(h.service_id);
    if (!prev || h.changed_at > prev) cancelDates.set(h.service_id, h.changed_at);
  }
  return serviceRevenueReport(services, returns, cancelDates, range, granularity);
}

export async function loadActiveServices(businessId: string, filter: ActiveServiceFilter = {}): Promise<ActiveServiceRow[]> {
  const [services, customers, machines, parts] = await Promise.all([
    db.services.where("business_id").equals(businessId).toArray(),
    db.customers.where("business_id").equals(businessId).toArray(),
    db.machines.where("business_id").equals(businessId).toArray(),
    db.service_parts.where("business_id").equals(businessId).toArray(),
  ]);
  const names = new Map(customers.map((c) => [c.id, c.name]));
  const titles = new Map(machines.map((m) => [m.id, machineTitleOf(m)]));
  const waiting = new Set(
    parts
      .filter((p) => (p.supply_status === "TO_ORDER" || p.supply_status === "ORDERED") && p.status !== "REJECTED" && p.status !== "DEFERRED")
      .map((p) => p.service_id)
  );
  const today = todayLocalDate();
  const rows: ActiveServiceRow[] = services
    .filter((s) => isOpenStatus(s.status))
    .map((s) => ({
      id: s.id,
      documentNo: s.document_no,
      customer: names.get(s.customer_id ?? "") ?? "—",
      machine: titles.get(s.machine_id ?? "") ?? "—",
      status: s.status,
      waitReason:
        s.status === "WAITING_CUSTOMER_APPROVAL" ? "Müşteri onayı"
        : s.status === "WAITING_PARTS" || waiting.has(s.id) ? "Parça bekleniyor"
        : undefined,
      promisedDate: s.promised_date ?? undefined,
      daysOverdue: s.promised_date ? daysOverdue(s.promised_date, today) : undefined,
    }));
  return activeServicesReport(rows, filter);
}

export async function loadStockReport(businessId: string, range: DateRange) {
  const [products, balances, movements] = await Promise.all([
    db.products.where("business_id").equals(businessId).filter((p) => !p.archived_at).toArray(),
    getBalances(businessId),
    db.stock_movements.where("business_id").equals(businessId).toArray(),
  ]);
  return stockReport(products, balances, movements, range);
}

/** Ürün bazlı hareket dökümü (kaynak belge dahil), yeniden eskiye. */
export async function loadMovementDetail(businessId: string, productId: string, range?: DateRange) {
  const rows = await db.stock_movements.where("product_id").equals(productId).filter((m) => m.business_id === businessId).toArray();
  return rows
    .filter((m) => !range || (localDate(m.created_at) >= range.from && localDate(m.created_at) <= range.to))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function loadMachineHistory(businessId: string) {
  const [machines, services, operations, customers] = await Promise.all([
    db.machines.where("business_id").equals(businessId).toArray(),
    db.services.where("business_id").equals(businessId).toArray(),
    db.service_operations.where("business_id").equals(businessId).filter((o) => o.status === "APPROVED" || o.status === "PENDING").toArray(),
    db.customers.where("business_id").equals(businessId).toArray(),
  ]);
  const ops = new Map<string, string[]>();
  for (const o of operations) ops.set(o.service_id, [...(ops.get(o.service_id) ?? []), o.description]);
  const names = new Map(customers.map((c) => [c.id, c.name]));
  return machineHistoryReport(machines, services, ops, machineTitleOf, (m) => names.get(m.customer_id ?? ""));
}

export async function loadCustomerStatement(businessId: string, customerId: string) {
  const [openings, sales, services, payments] = await Promise.all([
    db.opening_balances.where("party_id").equals(customerId).filter((o) => o.party_type === "CUSTOMER" && o.business_id === businessId).toArray(),
    db.sales.where("customer_id").equals(customerId).toArray(),
    db.services.where("customer_id").equals(customerId).toArray(),
    db.payments.where("customer_id").equals(customerId).toArray(),
  ]);
  const ids = new Set([...sales.map((s) => s.id), ...services.map((s) => s.id)]);
  const returns = (await db.return_transactions.where("business_id").equals(businessId).toArray()).filter(
    (r) => (r.original_type === "SALE" || r.original_type === "SERVICE") && ids.has(r.original_id)
  );
  return customerStatement({ openings, sales, services, payments, returns });
}

export { statusLabel };
