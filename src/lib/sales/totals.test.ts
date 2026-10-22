import { describe, expect, it } from "vitest";
import { computeSaleTotals } from "./totals";

const line = (unitPriceKurus: number, quantity: number, over = {}) => ({
  unitPriceKurus,
  quantity,
  taxMode: "NONE" as const,
  taxRate: 0,
  ...over,
});

describe("computeSaleTotals", () => {
  it("indirimsiz toplam, KDV ayrımı ve satır sayısı", () => {
    const r = computeSaleTotals([
      line(12000, 1, { taxMode: "INCLUSIVE", taxRate: 20 }),
      line(10000, 2, { taxMode: "EXCLUSIVE", taxRate: 20 }),
    ]);
    // 120 (dahil) + 240 (200 + 40)
    expect(r.totals).toEqual({ subtotal: 30000, discountTotal: 0, taxTotal: 6000, total: 36000 });
    expect(r.lines).toHaveLength(2);
  });

  it("belge indirimi satırlara dağıtılır, satır indirimiyle toplanır, toplam kuruşu tutar", () => {
    const r = computeSaleTotals([line(10000, 1, { discountKurus: 1000 }), line(20000, 1)], 2700);
    // ağırlıklar: 9000 ve 20000 → paylar 838 ve 1862 (toplam 2700)
    expect(r.lines.map((l) => l.discountKurus)).toEqual([1000 + 838, 1862]);
    expect(r.totals.discountTotal).toBe(1000 + 2700);
    expect(r.totals.total).toBe(30000 - 3700);
  });

  it("geçersiz indirimleri reddeder", () => {
    expect(() => computeSaleTotals([line(10000, 1)], 10001)).toThrow(/büyük olamaz/);
    expect(() => computeSaleTotals([line(10000, 1)], -1)).toThrow();
    expect(() => computeSaleTotals([line(10000, 1, { discountKurus: 10001 })])).toThrow(/ndirim satır tutarından/);
  });

  it("ondalıklı miktar", () => {
    expect(computeSaleTotals([line(8000, 2.5)]).totals.total).toBe(20000);
  });
});
