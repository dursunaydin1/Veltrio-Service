import { describe, expect, it } from "vitest";
import type { Payment } from "@/types";
import type { ReturnTransaction, Sale, Service } from "@/lib/db";
import {
  activeServicesReport,
  collectionsReport,
  customerStatement,
  localDate,
  salesReport,
  serviceRevenueReport,
  stockReport,
  machineHistoryReport,
  type ActiveServiceRow,
} from "./calc";

const range = { from: "2026-10-01", to: "2026-10-31" };

const sale = (over: Partial<Sale> = {}): Sale => ({
  id: "s1", business_id: "b", document_no: "SAT-1", sale_date: "2026-10-05T12:00:00.000Z", subtotal: 100, discount_total: 0,
  tax_total: 0, total_amount: 100, status: "FINAL", finalized_at: "2026-10-05T09:00:00.000Z",
  created_by_device: "D", created_at: "2026-10-05T09:00:00.000Z", updated_at: "2026-10-05T09:00:00.000Z", ...over,
});
const ret = (over: Partial<ReturnTransaction> = {}): ReturnTransaction => ({
  id: "r1", business_id: "b", document_no: "IAD-1", original_type: "SALE", original_id: "s1", return_date: "2026-10-07T10:00:00.000Z",
  total_amount: 30, status: "POSTED", created_by_device: "D", created_at: "2026-10-07T10:00:00.000Z", ...over,
});
const pay = (over: Partial<Payment> = {}): Payment => ({
  id: "p1", business_id: "b", direction: "IN", method: "CASH", amount: 50, payment_date: "2026-10-05T10:00:00.000Z",
  status: "VALID", created_by_device: "D", created_at: "2026-10-05T10:00:00.000Z", ...over,
});

describe("yerel tarih", () => {
  it("UTC gece yarısına yakın an Türkiye tarihine göre gruplanır", () => {
    expect(localDate("2026-10-05T21:30:00.000Z")).toBe("2026-10-06"); // 00:30 İstanbul
    expect(localDate("2026-10-05T20:59:00.000Z")).toBe("2026-10-05");
  });
});

describe("satış raporu (AC-023)", () => {
  it("brüt, KDV, indirim ayrı; iade ve iptal net toplamdan düşer; taslak ve kesinleşmemiş iptal sayılmaz", () => {
    const sales = [
      sale({ id: "a", total_amount: 120, tax_total: 20, discount_total: 5 }),
      sale({ id: "b2", total_amount: 200, sale_date: "2026-10-06T12:00:00.000Z" }),
      sale({ id: "c", total_amount: 80, status: "CANCELLED", sale_date: "2026-10-06T12:00:00.000Z", updated_at: "2026-10-08T09:00:00.000Z" }),
      sale({ id: "d", total_amount: 999, status: "DRAFT", finalized_at: undefined }),
      sale({ id: "e", total_amount: 777, status: "CANCELLED", finalized_at: undefined }),
      sale({ id: "f", total_amount: 50, sale_date: "2026-09-30T12:00:00.000Z" }), // aralık dışı
    ];
    const { rows, totals } = salesReport(sales, [ret({ original_id: "a", total_amount: 30 })], range, "day");
    expect(totals).toMatchObject({ count: 3, gross: 40000, tax: 2000, discount: 500, returns: 3000, cancelled: 8000, net: 40000 - 3000 - 8000 });
    expect(rows.map((r) => r.bucket)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(rows.find((r) => r.bucket === "2026-10-07")).toMatchObject({ returns: 3000, gross: 0, net: -3000 });
    expect(rows.find((r) => r.bucket === "2026-10-08")).toMatchObject({ cancelled: 8000 });
  });

  it("aylık gruplama ve geri alınmış / başka satışa ait olmayan iadeler dikkate alınmaz", () => {
    const { rows, totals } = salesReport(
      [sale({ id: "a" }), sale({ id: "b2", sale_date: "2026-10-20T12:00:00.000Z" })],
      [ret({ status: "REVERSED" }), ret({ id: "r2", original_id: "yok" })],
      range,
      "month"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ bucket: "2026-10", count: 2, gross: 20000, returns: 0 });
    expect(totals.net).toBe(20000);
  });
});

describe("tahsilat raporu — veresiye girmez (AC-010, AC-023)", () => {
  it("yönteme göre ayrılır; iade ve ters kayıt ayrı sütunda; tedarikçi ödemesi hariç", () => {
    const report = collectionsReport(
      [
        pay({ id: "1", method: "CASH", amount: 100 }),
        pay({ id: "2", method: "CARD", amount: 40 }),
        pay({ id: "3", method: "CASH", direction: "OUT", amount: 25, reversal_of_id: "1" }),
        pay({ id: "4", method: "BANK_TRANSFER", amount: 500, supplier_id: "sup" }),
        pay({ id: "5", method: "CASH", amount: 10, payment_date: "2026-09-30T10:00:00.000Z" }),
      ],
      range,
      "month"
    );
    expect(report.totals).toEqual({ received: 14000, refunded: 2500, net: 11500 });
    expect(report.byMethod.map((m) => [m.method, m.net])).toEqual([["CARD", 4000], ["CASH", 7500]]);
  });
});

describe("servis geliri raporu — tahsilattan ayrı (AC-023)", () => {
  const svc = (over: Partial<Service> = {}): Service =>
    ({
      id: "v1", business_id: "b", customer_id: "c", machine_id: "m", document_no: "S-1", status: "DELIVERED", total_amount: 1000,
      first_completed_at: "2026-10-10T09:00:00.000Z", is_warranty_claim: false, deposit_amount: 0, labor_fee: 0,
      received_date: "2026-10-01T00:00:00.000Z", created_by_device: "D", created_at: "x", updated_at: "x", ...over,
    }) as Service;

  it("tamamlanma tarihine göre tahakkuk; iade düşer, iptalde alınan inceleme ücreti eklenir; iptal edilen servis sayılmaz", () => {
    const services = [
      svc(),
      svc({ id: "v2", total_amount: 400, first_completed_at: "2026-10-12T09:00:00.000Z" }),
      svc({ id: "v3", status: "CANCELLED", total_amount: 700, cancel_fee: 150, first_completed_at: undefined, updated_at: "2026-10-15T09:00:00.000Z" }),
      svc({ id: "v4", total_amount: 50, first_completed_at: undefined, status: "IN_PROGRESS" }),
    ];
    const returns = [ret({ id: "r9", original_type: "SERVICE", original_id: "v1", total_amount: 100, return_date: "2026-10-20T10:00:00.000Z" })];
    const { rows, totals } = serviceRevenueReport(services, returns, new Map([["v3", "2026-10-15T09:00:00.000Z"]]), range, "month");
    expect(rows).toHaveLength(1);
    expect(totals).toMatchObject({ count: 2, revenue: 140000, returns: 10000, cancelFees: 15000, net: 140000 + 15000 - 10000 });
  });
});

describe("aktif servisler raporu", () => {
  const row = (over: Partial<ActiveServiceRow>): ActiveServiceRow => ({ id: "1", documentNo: "S-1", customer: "A", machine: "M", status: "IN_PROGRESS", ...over });

  it("geciken önce, sonra yaklaşan, sonra sözü olmayan; durum ve teslim tarihi filtreler", () => {
    const rows = [
      row({ id: "a", documentNo: "S-A", promisedDate: "2026-10-20", daysOverdue: -3 }),
      row({ id: "b", documentNo: "S-B" }),
      row({ id: "c", documentNo: "S-C", promisedDate: "2026-10-10", daysOverdue: 7 }),
      row({ id: "d", documentNo: "S-D", status: "WAITING_PARTS", promisedDate: "2026-10-12", daysOverdue: 5 }),
    ];
    expect(activeServicesReport(rows).map((r) => r.id)).toEqual(["c", "d", "a", "b"]);
    expect(activeServicesReport(rows, { status: "WAITING_PARTS" }).map((r) => r.id)).toEqual(["d"]);
    expect(activeServicesReport(rows, { dueFrom: "2026-10-11", dueTo: "2026-10-15" }).map((r) => r.id)).toEqual(["d"]);
  });
});

describe("stok raporu", () => {
  it("kritik ürünler başta; aralıktaki giriş/çıkış yalnızca satılabilir kovadan hesaplanır", () => {
    const products = [
      { id: "p1", name: "Zincir", unit: "ADET", critical_stock_level: 5 },
      { id: "p2", name: "Buji", unit: "ADET" },
    ];
    const balances = new Map([["p1", { available: 3, damaged: 1 }], ["p2", { available: 40, damaged: 0 }]]);
    const m = (product_id: string, quantity: number, bucket: "AVAILABLE" | "DAMAGED" = "AVAILABLE", at = "2026-10-05T10:00:00.000Z") =>
      ({ id: `${product_id}${quantity}${bucket}`, business_id: "b", product_id, movement_type: "SALE_OUT", bucket, quantity, created_by_device: "D", created_at: at }) as never;
    const rows = stockReport(products, balances, [m("p2", 50), m("p2", -10), m("p2", 5, "DAMAGED"), m("p2", 99, "AVAILABLE", "2026-09-01T10:00:00.000Z")], range);
    expect(rows.map((r) => r.productId)).toEqual(["p1", "p2"]);
    expect(rows[0]).toMatchObject({ critical: true, damaged: 1 });
    expect(rows[1]).toMatchObject({ critical: false, inQty: 50, outQty: 10 });
  });
});

describe("makine geçmişi raporu", () => {
  it("tamamlanmış servisleri, sayıyı ve son servis tarihini verir; geçmişi olmayan makine listelenmez", () => {
    const machines = [{ id: "m1", merged_into_id: undefined }, { id: "m2" }, { id: "m3", merged_into_id: "m1" }] as never[];
    const mk = (id: string, machine_id: string, done: string | undefined, status = "DELIVERED") =>
      ({ id, machine_id, document_no: `S-${id}`, first_completed_at: done, status, total_amount: 100, customer_complaint: "x" }) as never;
    const rows = machineHistoryReport(
      machines,
      [mk("a", "m1", "2026-09-01T10:00:00.000Z"), mk("b", "m1", "2026-10-01T10:00:00.000Z"), mk("c", "m1", undefined, "CANCELLED"), mk("d", "m3", "2026-10-02T10:00:00.000Z")],
      new Map([["b", ["Karbüratör ayarı", "Buji"]]]),
      (m) => `Makine ${(m as { id: string }).id}`,
      () => "Ali"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ machineId: "m1", completedCount: 2, lastService: "2026-10-01", owner: "Ali" });
    expect(rows[0].services[0].summary).toBe("Karbüratör ayarı, Buji");
  });
});

describe("müşteri hesap ekstresi", () => {
  it("tarih sırasıyla yürüyen bakiye hesaplar (pozitif = müşteri borçlu)", () => {
    const lines = customerStatement({
      openings: [{ id: "o", direction: "OWED_BY_PARTY", amount: 500, as_of_date: "2026-01-01" }],
      sales: [sale({ total_amount: 200 })],
      services: [],
      payments: [pay({ amount: 300, payment_date: "2026-10-06T10:00:00.000Z" })],
      returns: [ret({ total_amount: 50 })],
    });
    expect(lines.map((l) => [l.kind, l.balance])).toEqual([
      ["Açılış bakiyesi", 50000],
      ["Satış", 70000],
      ["Tahsilat", 40000],
      ["İade", 35000],
    ]);
  });
});
