import { toKurus } from "@/lib/calc";
import type { Machine, Payment, PaymentMethod, StockMovement } from "@/types";
import type { ReturnTransaction, Sale, Service } from "@/lib/db";

/**
 * Rapor hesapları (PRD §15, Adım 6.9-6.14, AC-023): saf fonksiyonlar. Tutarlar kuruş
 * cinsinden tam sayıdır; tarihler Türkiye yerel takvimine (Europe/Istanbul) göre
 * gruplanır. Satış, tahsilat ve servis geliri **ayrı** hesaplanır; iptal ve iade
 * orijinal belgeyi silmez, kendi tarihinde ters kayıt olarak net toplamdan düşer.
 */

export type DateRange = { from: string; to: string };
export type Granularity = "day" | "month";

const FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" });

/** Anı Türkiye yerel tarihine (YYYY-MM-DD) çevirir. */
export function localDate(iso: string): string {
  return FORMATTER.format(new Date(iso));
}

export const inRange = (date: string, range: DateRange) => date >= range.from && date <= range.to;

export function bucketOf(date: string, granularity: Granularity): string {
  return granularity === "month" ? date.slice(0, 7) : date;
}

export function monthRange(today: string): DateRange {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

// ------------------------------------------------------------------ Satış raporu

export type SalesRow = {
  bucket: string;
  count: number;
  /** KDV dahil brüt satış (kesinleşmiş belgelerin toplamı), kuruş */
  gross: number;
  /** Belgelerdeki toplam indirim (bilgi), kuruş */
  discount: number;
  /** Belgelerdeki KDV tutarı (ayrı sütun), kuruş */
  tax: number;
  returns: number;
  cancelled: number;
  /** brüt − iade − iptal */
  net: number;
};

const emptyRow = (bucket: string): SalesRow => ({ bucket, count: 0, gross: 0, discount: 0, tax: 0, returns: 0, cancelled: 0, net: 0 });

/**
 * Günlük / aylık satış raporu. Brüt: belge tarihine göre kesinleşmiş (taslak olmayan)
 * satışlar. İptal: iptal edildiği güne, iade: iade tarihine yazılır; ikisi de net toplamdan düşer.
 */
export function salesReport(
  sales: Sale[],
  returns: ReturnTransaction[],
  range: DateRange,
  granularity: Granularity
): { rows: SalesRow[]; totals: SalesRow } {
  const rows = new Map<string, SalesRow>();
  const row = (bucket: string) => {
    let r = rows.get(bucket);
    if (!r) rows.set(bucket, (r = emptyRow(bucket)));
    return r;
  };
  const saleById = new Map(sales.map((s) => [s.id, s]));

  for (const s of sales) {
    if (!s.finalized_at) continue; // taslak veya hiç kesinleşmeden iptal edilen belge satış değildir
    const date = localDate(s.sale_date);
    if (inRange(date, range)) {
      const r = row(bucketOf(date, granularity));
      r.count += 1;
      r.gross += toKurus(s.total_amount);
      r.discount += toKurus(s.discount_total);
      r.tax += toKurus(s.tax_total);
    }
    if (s.status === "CANCELLED") {
      const cancelDate = localDate(s.updated_at);
      if (inRange(cancelDate, range)) row(bucketOf(cancelDate, granularity)).cancelled += toKurus(s.total_amount);
    }
  }
  for (const r of returns) {
    if (r.original_type !== "SALE" || r.status !== "POSTED" || !saleById.has(r.original_id)) continue;
    const date = localDate(r.return_date);
    if (inRange(date, range)) row(bucketOf(date, granularity)).returns += toKurus(r.total_amount);
  }

  const list = [...rows.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  for (const r of list) r.net = r.gross - r.returns - r.cancelled;
  const totals = list.reduce((t, r) => {
    t.count += r.count; t.gross += r.gross; t.discount += r.discount; t.tax += r.tax;
    t.returns += r.returns; t.cancelled += r.cancelled; t.net += r.net;
    return t;
  }, emptyRow("Toplam"));
  return { rows: list, totals };
}

// ------------------------------------------------------------------ Tahsilat raporu

export type CollectionRow = { bucket: string; method: PaymentMethod | "ALL"; received: number; refunded: number; net: number };

/**
 * Tahsilat raporu: fiilî ödeme hareketleri, ödeme tarihine göre, yönteme (nakit/kart/banka/diğer)
 * ayrılarak. Veresiye (ödenmemiş tutar) hiçbir zaman girmez. Tedarikçi ödemeleri hariçtir.
 * "İade / ters": müşteriye yapılan para iadeleri ve ters kayıtlar.
 */
export function collectionsReport(
  payments: Payment[],
  range: DateRange,
  granularity: Granularity
): { rows: CollectionRow[]; byMethod: CollectionRow[]; totals: { received: number; refunded: number; net: number } } {
  const cells = new Map<string, CollectionRow>();
  const methods = new Map<PaymentMethod, CollectionRow>();

  for (const p of payments) {
    if (p.supplier_id) continue;
    const date = localDate(p.payment_date);
    if (!inRange(date, range)) continue;
    const amount = toKurus(p.amount);
    const bucket = bucketOf(date, granularity);
    const cellKey = `${bucket}|${p.method}`;
    const cell = cells.get(cellKey) ?? { bucket, method: p.method, received: 0, refunded: 0, net: 0 };
    const total = methods.get(p.method) ?? { bucket: "Toplam", method: p.method, received: 0, refunded: 0, net: 0 };
    if (p.direction === "IN") {
      cell.received += amount;
      total.received += amount;
    } else {
      cell.refunded += amount;
      total.refunded += amount;
    }
    cells.set(cellKey, cell);
    methods.set(p.method, total);
  }

  const fix = (r: CollectionRow) => ({ ...r, net: r.received - r.refunded });
  const rows = [...cells.values()].map(fix).sort((a, b) => a.bucket.localeCompare(b.bucket) || a.method.localeCompare(b.method));
  const byMethod = [...methods.values()].map(fix).sort((a, b) => a.method.localeCompare(b.method));
  const received = byMethod.reduce((a, r) => a + r.received, 0);
  const refunded = byMethod.reduce((a, r) => a + r.refunded, 0);
  return { rows, byMethod, totals: { received, refunded, net: received - refunded } };
}

// ------------------------------------------------------------------ Servis geliri raporu

export type ServiceRevenueRow = { bucket: string; count: number; revenue: number; returns: number; cancelFees: number; net: number };

/**
 * Servis geliri (tahakkuk): tamamlanma tarihine göre (`first_completed_at`, yeniden açılan servis
 * ikinci kez sayılmaz). Tahsilattan bağımsızdır. Servis iade/düzeltmeleri iade tarihinde,
 * iptalde alınan inceleme ücreti iptal tarihinde eklenir/düşer.
 */
export function serviceRevenueReport(
  services: Service[],
  returns: ReturnTransaction[],
  cancelDates: Map<string, string>,
  range: DateRange,
  granularity: Granularity
): { rows: ServiceRevenueRow[]; totals: ServiceRevenueRow } {
  const rows = new Map<string, ServiceRevenueRow>();
  const row = (bucket: string) => {
    let r = rows.get(bucket);
    if (!r) rows.set(bucket, (r = { bucket, count: 0, revenue: 0, returns: 0, cancelFees: 0, net: 0 }));
    return r;
  };
  const byId = new Map(services.map((s) => [s.id, s]));

  for (const s of services) {
    if (s.first_completed_at && s.status !== "CANCELLED") {
      const date = localDate(s.first_completed_at);
      if (inRange(date, range)) {
        const r = row(bucketOf(date, granularity));
        r.count += 1;
        r.revenue += toKurus(s.total_amount);
      }
    }
    if (s.status === "CANCELLED" && (s.cancel_fee ?? 0) > 0) {
      const at = cancelDates.get(s.id) ?? s.updated_at;
      const date = localDate(at);
      if (inRange(date, range)) row(bucketOf(date, granularity)).cancelFees += toKurus(s.cancel_fee ?? 0);
    }
  }
  for (const r of returns) {
    if (r.original_type !== "SERVICE" || r.status !== "POSTED" || !byId.has(r.original_id)) continue;
    const date = localDate(r.return_date);
    if (inRange(date, range)) row(bucketOf(date, granularity)).returns += toKurus(r.total_amount);
  }

  const list = [...rows.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  for (const r of list) r.net = r.revenue + r.cancelFees - r.returns;
  const totals = list.reduce(
    (t, r) => ({ ...t, count: t.count + r.count, revenue: t.revenue + r.revenue, returns: t.returns + r.returns, cancelFees: t.cancelFees + r.cancelFees, net: t.net + r.net }),
    { bucket: "Toplam", count: 0, revenue: 0, returns: 0, cancelFees: 0, net: 0 }
  );
  return { rows: list, totals };
}

// ------------------------------------------------------------------ Aktif servisler

export type ActiveServiceRow = {
  id: string;
  documentNo: string;
  customer: string;
  machine: string;
  status: string;
  waitReason?: string;
  promisedDate?: string;
  /** Pozitif: gecikmiş gün, negatif: kalan gün, undefined: söz yok */
  daysOverdue?: number;
};

export type ActiveServiceFilter = { status?: string; dueFrom?: string; dueTo?: string };

/** Açık servisler: gecikenler önce, sonra yaklaşanlar, sonra teslim sözü olmayanlar. */
export function activeServicesReport(rows: ActiveServiceRow[], filter: ActiveServiceFilter = {}): ActiveServiceRow[] {
  return rows
    .filter((r) => !filter.status || r.status === filter.status)
    .filter((r) => !filter.dueFrom || (r.promisedDate !== undefined && r.promisedDate >= filter.dueFrom))
    .filter((r) => !filter.dueTo || (r.promisedDate !== undefined && r.promisedDate <= filter.dueTo))
    .sort((a, b) => {
      const ao = a.daysOverdue ?? Number.NEGATIVE_INFINITY;
      const bo = b.daysOverdue ?? Number.NEGATIVE_INFINITY;
      if (a.daysOverdue === undefined && b.daysOverdue !== undefined) return 1;
      if (b.daysOverdue === undefined && a.daysOverdue !== undefined) return -1;
      return bo - ao || a.documentNo.localeCompare(b.documentNo);
    });
}

// ------------------------------------------------------------------ Stok raporu

export type StockReportRow = {
  productId: string;
  name: string;
  code?: string;
  unit: string;
  available: number;
  damaged: number;
  criticalLevel?: number;
  critical: boolean;
  /** Seçilen aralıktaki giriş / çıkış toplamı (satılabilir kova) */
  inQty: number;
  outQty: number;
};

export function stockReport(
  products: { id: string; name: string; code?: string; unit: string; critical_stock_level?: number }[],
  balances: Map<string, { available: number; damaged: number }>,
  movements: StockMovement[],
  range: DateRange
): StockReportRow[] {
  const flow = new Map<string, { in: number; out: number }>();
  for (const m of movements) {
    if (m.bucket !== "AVAILABLE" || !inRange(localDate(m.created_at), range)) continue;
    const f = flow.get(m.product_id) ?? { in: 0, out: 0 };
    if (m.quantity > 0) f.in += m.quantity;
    else f.out += -m.quantity;
    flow.set(m.product_id, f);
  }
  return products
    .map((p) => {
      const b = balances.get(p.id) ?? { available: 0, damaged: 0 };
      const f = flow.get(p.id) ?? { in: 0, out: 0 };
      return {
        productId: p.id, name: p.name, code: p.code, unit: p.unit,
        available: b.available, damaged: b.damaged, criticalLevel: p.critical_stock_level,
        critical: p.critical_stock_level != null && b.available <= p.critical_stock_level,
        inQty: Math.round(f.in * 10000) / 10000, outQty: Math.round(f.out * 10000) / 10000,
      };
    })
    .sort((a, b) => Number(b.critical) - Number(a.critical) || a.name.localeCompare(b.name, "tr"));
}

export const MOVEMENT_LABEL: Record<string, string> = {
  OPENING: "Açılış", PURCHASE_IN: "Alım girişi", SALE_OUT: "Satış çıkışı", SERVICE_USE: "Servis kullanımı",
  RETURN_IN: "İade girişi", RETURN_OUT: "Tedarikçiye iade", ADJUSTMENT_IN: "Düzeltme (giriş)",
  ADJUSTMENT_OUT: "Düzeltme (çıkış)", DAMAGED_IN: "Hasarlıya alma", DAMAGED_DISPOSE: "Hasarlı imha",
  TRANSFER: "Aktarım", CANCEL_REVERSAL: "İptal / ters kayıt",
};

// ------------------------------------------------------------------ Makine geçmişi

export type MachineHistoryRow = {
  machineId: string;
  title: string;
  serial?: string;
  owner?: string;
  completedCount: number;
  lastService?: string;
  services: { id: string; documentNo: string; date: string; summary: string; total: number }[];
};

/** Makineye bağlı tamamlanmış (iptal edilmemiş) servisler, tarih, işlem özeti ve sayı. */
export function machineHistoryReport(
  machines: Machine[],
  services: Service[],
  operationsByService: Map<string, string[]>,
  titleOf: (m: Machine) => string,
  ownerOf: (m: Machine) => string | undefined
): MachineHistoryRow[] {
  return machines
    .filter((m) => !m.merged_into_id)
    .map((m) => {
      const done = services
        .filter((s) => s.machine_id === m.id && s.first_completed_at && s.status !== "CANCELLED")
        .sort((a, b) => (b.first_completed_at as string).localeCompare(a.first_completed_at as string))
        .map((s) => ({
          id: s.id,
          documentNo: s.document_no,
          date: localDate(s.first_completed_at as string),
          summary: (operationsByService.get(s.id) ?? []).join(", ") || (s.resolution ?? s.customer_complaint ?? ""),
          total: toKurus(s.total_amount),
        }));
      return {
        machineId: m.id, title: titleOf(m), serial: m.serial_number ?? m.internal_number, owner: ownerOf(m),
        completedCount: done.length, lastService: done[0]?.date, services: done,
      };
    })
    .filter((r) => r.completedCount > 0)
    .sort((a, b) => (b.lastService ?? "").localeCompare(a.lastService ?? ""));
}

// ------------------------------------------------------------------ Hesap ekstresi

export type StatementLine = { date: string; kind: string; description: string; debit: number; credit: number; balance: number };

/**
 * Müşteri hesap ekstresi: açılış bakiyesi, satışlar, servisler, ödemeler ve iadeler tarih
 * sırasıyla, yürüyen bakiyeyle. Pozitif bakiye = müşteri borçlu.
 */
export function customerStatement(input: {
  openings: { id: string; direction: "OWED_BY_PARTY" | "OWED_TO_PARTY"; amount: number; as_of_date: string }[];
  sales: Sale[];
  services: Service[];
  payments: Payment[];
  returns: ReturnTransaction[];
}): StatementLine[] {
  type Raw = Omit<StatementLine, "balance"> & { at: string };
  const raw: Raw[] = [];
  for (const o of input.openings) {
    const amount = toKurus(o.amount);
    raw.push({
      at: `${o.as_of_date}T00:00:00Z`, date: o.as_of_date, kind: "Açılış bakiyesi", description: o.direction === "OWED_BY_PARTY" ? "Müşteri borcu" : "Müşteri alacağı",
      debit: o.direction === "OWED_BY_PARTY" ? amount : 0, credit: o.direction === "OWED_TO_PARTY" ? amount : 0,
    });
  }
  for (const s of input.sales) {
    if (s.status !== "FINAL") continue;
    raw.push({ at: s.sale_date, date: localDate(s.sale_date), kind: "Satış", description: s.document_no, debit: toKurus(s.total_amount), credit: 0 });
  }
  for (const s of input.services) {
    if (s.status === "CANCELLED") {
      if ((s.cancel_fee ?? 0) > 0) raw.push({ at: s.updated_at, date: localDate(s.updated_at), kind: "İnceleme ücreti", description: s.document_no, debit: toKurus(s.cancel_fee ?? 0), credit: 0 });
      continue;
    }
    if (!s.first_completed_at) continue;
    raw.push({ at: s.first_completed_at, date: localDate(s.first_completed_at), kind: "Servis", description: s.document_no, debit: toKurus(s.total_amount), credit: 0 });
  }
  for (const r of input.returns) {
    if (r.status !== "POSTED") continue;
    raw.push({ at: r.return_date, date: localDate(r.return_date), kind: "İade", description: r.document_no, debit: 0, credit: toKurus(r.total_amount) });
  }
  for (const p of input.payments) {
    const amount = toKurus(p.amount);
    const label = p.reversal_of_id ? "Ters kayıt" : p.direction === "IN" ? "Tahsilat" : "Müşteriye ödeme";
    raw.push({
      at: p.payment_date, date: localDate(p.payment_date), kind: label, description: p.note ?? "",
      debit: p.direction === "OUT" ? amount : 0, credit: p.direction === "IN" ? amount : 0,
    });
  }
  raw.sort((a, b) => a.at.localeCompare(b.at));
  let balance = 0;
  return raw.map(({ at: _at, ...line }) => {
    void _at;
    balance += line.debit - line.credit;
    return { ...line, balance };
  });
}
