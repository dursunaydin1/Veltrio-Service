import { describe, expect, it } from "vitest";
import { matchesPurchase } from "./PurchaseList";
import type { Purchase } from "@/lib/db";

const p = (over: Partial<Purchase> = {}): Purchase => ({
  id: "1",
  business_id: "b",
  document_no: "AL-DEMO-AB23-2026-00003",
  supplier_id: "s",
  purchase_date: "2026-10-22T12:00:00Z",
  total_amount: 740,
  status: "RECEIVED",
  supplier_ref: "İrs-77",
  created_by_device: "X",
  created_at: "",
  updated_at: "",
  ...over,
});

describe("matchesPurchase", () => {
  it("belge no, tedarikçi adı ve fatura no ile bulunur; Türkçe karakter fark etmez", () => {
    expect(matchesPurchase(p(), "Orman Makine", "00003")).toBe(true);
    expect(matchesPurchase(p(), "Orman Makine", "orman")).toBe(true);
    expect(matchesPurchase(p(), "Şişli Yedek", "SISLI")).toBe(true);
    expect(matchesPurchase(p(), "Orman Makine", "irs-77")).toBe(true);
    expect(matchesPurchase(p(), "Orman Makine", "husqvarna")).toBe(false);
  });

  it("boş arama hepsini getirir", () => {
    expect(matchesPurchase(p(), "", "  ")).toBe(true);
  });
});
