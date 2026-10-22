import { describe, expect, it } from "vitest";
import { approvalRequired, isBilled, needsApprovalBeforeWork, summarizeLines } from "./lines";

const line = (line_total: number, status: "PENDING" | "APPROVED" | "REJECTED" | "DEFERRED", price_pending = false) => ({
  line_total,
  status,
  price_pending,
});

describe("summarizeLines (SR-006, TC-004)", () => {
  it("reddedilen ve ertelenen kalemler toplama girmez", () => {
    const s = summarizeLines([line(500, "APPROVED"), line(300, "PENDING"), line(200, "REJECTED"), line(100, "DEFERRED")]);
    expect(s).toMatchObject({ quote: 80000, approved: 50000, pending: 30000, pendingCount: 1 });
  });

  it("kuruş hassasiyeti korunur (0,1 + 0,2)", () => {
    expect(summarizeLines([line(0.1, "APPROVED"), line(0.2, "APPROVED")]).approved).toBe(30);
  });

  it("fiyatı belirlenmemiş kalemleri sayar, reddedilmiş olanları saymaz", () => {
    const s = summarizeLines([line(0, "PENDING", true), line(0, "REJECTED", true), line(100, "APPROVED")]);
    expect(s.unpriced).toBe(1);
    expect(s.pendingCount).toBe(1);
  });

  it("boş teklif sıfırdır", () => {
    expect(summarizeLines([])).toEqual({ quote: 0, approved: 0, pending: 0, pendingCount: 0, unpriced: 0 });
  });

  it("isBilled", () => {
    expect(isBilled("PENDING") && isBilled("APPROVED")).toBe(true);
    expect(isBilled("REJECTED") || isBilled("DEFERRED")).toBe(false);
  });
});

describe("onay eşiği (SR-004)", () => {
  it("toplam eşiği aşıyorsa onay gerekir; eşitse gerekmez", () => {
    expect(approvalRequired(100001, 1000)).toBe(true);
    expect(approvalRequired(100000, 1000)).toBe(false);
    expect(approvalRequired(50000, 1000)).toBe(false);
  });

  it("eşik 0: ücretli her işte onay gerekir, ücretsiz işte gerekmez", () => {
    expect(approvalRequired(1, 0)).toBe(true);
    expect(approvalRequired(0, 0)).toBe(false);
  });

  it("onay gereken serviste bekleyen kalem varsa işe başlanamaz; hepsi kararlıysa başlanır", () => {
    const pending = summarizeLines([line(1500, "PENDING")]);
    const decided = summarizeLines([line(1500, "APPROVED")]);
    expect(needsApprovalBeforeWork(pending, 1000)).toBe(true);
    expect(needsApprovalBeforeWork(decided, 1000)).toBe(false);
  });

  it("eşik altındaki teklif bekleyen kalemle de başlayabilir", () => {
    expect(needsApprovalBeforeWork(summarizeLines([line(400, "PENDING")]), 1000)).toBe(false);
  });
});
