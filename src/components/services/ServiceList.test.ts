import { describe, expect, it } from "vitest";
import { inTab, isOverdue, matchesService } from "./ServiceList";
import type { Service } from "@/lib/db";

const svc = (over: Partial<Service> = {}): Service => ({
  id: "1",
  business_id: "b",
  document_no: "S-DEMO-AB23-2026-00001",
  status: "RECEIVED",
  customer_complaint: "Zor çalışıyor",
  deposit_amount: 0,
  labor_fee: 0,
  total_amount: 0,
  received_date: "2026-10-22T10:00:00Z",
  is_warranty_claim: false,
  created_by_device: "X",
  created_at: "",
  updated_at: "",
  ...over,
});

describe("sekmeler", () => {
  it("aktif = teslim edilmemiş ve iptal edilmemiş (tamamlanıp teslim bekleyen dahil)", () => {
    expect(inTab(svc({ status: "COMPLETED" }), "active")).toBe(true);
    expect(inTab(svc({ status: "DELIVERED" }), "active")).toBe(false);
    expect(inTab(svc({ status: "DELIVERED" }), "delivered")).toBe(true);
    expect(inTab(svc({ status: "CANCELLED" }), "cancelled")).toBe(true);
    expect(inTab(svc({ status: "CANCELLED" }), "active")).toBe(false);
  });
});

describe("isOverdue", () => {
  it("yalnızca açık servis ve geçmiş teslim sözü gecikmiştir", () => {
    const today = "2026-10-22";
    expect(isOverdue(svc({ promised_date: "2026-10-21" }), today)).toBe(true);
    expect(isOverdue(svc({ promised_date: "2026-10-22" }), today)).toBe(false);
    expect(isOverdue(svc({ promised_date: "2026-10-21", status: "DELIVERED" }), today)).toBe(false);
    expect(isOverdue(svc({}), today)).toBe(false);
  });
});

describe("matchesService", () => {
  it("belge no, müşteri, makine ve şikâyette Türkçe karakter fark etmeden arar", () => {
    const s = svc();
    expect(matchesService(s, "Şükrü Kaya", "Stihl MS 180", "00001")).toBe(true);
    expect(matchesService(s, "Şükrü Kaya", "Stihl MS 180", "sukru stihl")).toBe(true);
    expect(matchesService(s, "Şükrü Kaya", "Stihl MS 180", "zor calisiyor")).toBe(true);
    expect(matchesService(s, "Şükrü Kaya", "Stihl MS 180", "husqvarna")).toBe(false);
    expect(matchesService(s, "", "", "  ")).toBe(true);
  });
});
