import { describe, expect, it } from "vitest";
import { matchesSupplier } from "./SupplierList";
import type { Supplier } from "@/types";

const s = (over: Partial<Supplier> = {}): Supplier => ({
  id: "1",
  business_id: "b",
  name: "Orman Makine Yedek Parça",
  phone: "0212 123 45 67",
  address: "Şişli / İstanbul",
  created_at: "",
  updated_at: "",
  ...over,
});

describe("matchesSupplier", () => {
  it("ad ve adreste Türkçe karakterden bağımsız kelime kelime arar", () => {
    expect(matchesSupplier(s(), "orman parca")).toBe(true);
    expect(matchesSupplier(s(), "sisli")).toBe(true);
    expect(matchesSupplier(s(), "husqvarna")).toBe(false);
  });

  it("rakamla arama telefonda yapılır, baştaki 0 yok sayılır; kısa rakam eşleşmez", () => {
    expect(matchesSupplier(s(), "0212 123")).toBe(true);
    expect(matchesSupplier(s(), "212123")).toBe(true);
    expect(matchesSupplier(s(), "21")).toBe(false);
    expect(matchesSupplier(s({ phone: undefined }), "212")).toBe(false);
  });

  it("boş arama hepsini getirir", () => {
    expect(matchesSupplier(s(), " ")).toBe(true);
  });
});
