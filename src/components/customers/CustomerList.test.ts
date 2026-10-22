import { describe, expect, it } from "vitest";
import { matchesCustomer } from "./CustomerList";
import type { Customer } from "@/types";

const c = (over: Partial<Customer> = {}): Customer => ({
  id: "1",
  business_id: "b",
  name: "Ali Yılmaz",
  phone: "0532 123 45 67",
  phone_normalized: "5321234567",
  village: "Çamlıca",
  created_at: "",
  updated_at: "",
  ...over,
});

describe("matchesCustomer", () => {
  it("boş arama herkesi getirir", () => {
    expect(matchesCustomer(c(), "")).toBe(true);
  });

  it("ad ve köyde Türkçe büyük/küçük harf ayrımsız kelime kelime arar", () => {
    expect(matchesCustomer(c(), "yılmaz")).toBe(true);
    expect(matchesCustomer(c(), "ali çamlıca")).toBe(true);
    expect(matchesCustomer(c(), "veli")).toBe(false);
  });

  it("Türkçe karakter yazmadan ve büyük harfle de bulur", () => {
    expect(matchesCustomer(c(), "ALI")).toBe(true);
    expect(matchesCustomer(c(), "yilmaz")).toBe(true);
    expect(matchesCustomer(c(), "camlica")).toBe(true);
    expect(matchesCustomer(c({ name: "İsmail Kaya" }), "ISMAIL")).toBe(true);
  });

  it("rakamla arama telefonda yapılır, baştaki 0 yok sayılır", () => {
    expect(matchesCustomer(c(), "0532")).toBe(true);
    expect(matchesCustomer(c(), "532 123")).toBe(true);
    expect(matchesCustomer(c(), "0532 123 45")).toBe(true);
    expect(matchesCustomer(c(), "999")).toBe(false);
  });

  it("çok kısa rakam araması eşleşme üretmez, telefonsuz müşteri telefonla bulunmaz", () => {
    expect(matchesCustomer(c(), "53")).toBe(false);
    expect(matchesCustomer(c({ phone: undefined, phone_normalized: undefined }), "532")).toBe(false);
  });
});
