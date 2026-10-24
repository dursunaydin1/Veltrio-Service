import { describe, expect, it } from "vitest";
import { verifyLineTotal } from "./verify";

const sale = (over: Record<string, unknown> = {}) => ({
  unit_price_snapshot: 100, quantity: 2, discount_amount: 0, tax_mode: "NONE", tax_rate: 0, line_total: 200, ...over,
});

describe("sunucuda satır toplamı doğrulama (AC-026)", () => {
  it("doğru toplamı kabul eder (KDV dahil / hariç / yok, ondalıklı miktar, indirim)", () => {
    expect(verifyLineTotal("sale_items", sale())).toBeNull();
    expect(verifyLineTotal("sale_items", sale({ tax_mode: "EXCLUSIVE", tax_rate: 20, line_total: 240 }))).toBeNull();
    expect(verifyLineTotal("sale_items", sale({ tax_mode: "INCLUSIVE", tax_rate: 20, line_total: 200 }))).toBeNull();
    expect(verifyLineTotal("sale_items", sale({ unit_price_snapshot: 33.33, quantity: 3, line_total: 99.99 }))).toBeNull();
    expect(verifyLineTotal("sale_items", sale({ discount_amount: 25, line_total: 175 }))).toBeNull();
    expect(verifyLineTotal("purchase_items", { unit_price: 50, quantity: 4, line_discount: 10, tax_mode: "NONE", tax_rate: 0, line_total: 190 })).toBeNull();
  });

  it("kuruş farkı olan toplamı reddeder ve nedenini söyler", () => {
    const error = verifyLineTotal("sale_items", sale({ line_total: 199.99 }));
    expect(error).toMatch(/hesaplanandan farklı/);
    expect(error).toMatch(/200\.00/);
    expect(verifyLineTotal("service_parts", { unit_price_snapshot: 125.5, quantity: 1, discount_amount: 0, tax_mode: "NONE", tax_rate: 0, line_total: 125 })).toMatch(/farklı/);
  });

  it("indirim satırdan büyükse veya vergi oranı aşırıysa hesaplanamadı der", () => {
    expect(verifyLineTotal("sale_items", sale({ discount_amount: 500 }))).toMatch(/hesaplanamadı/);
    expect(verifyLineTotal("sale_items", sale({ tax_mode: "INCLUSIVE", tax_rate: 150 }))).toMatch(/hesaplanamadı/);
  });

  it("doğrulanmayan tablolar, fiyatı belirsiz satır ve eksik alanlı güncellemeler atlanır", () => {
    expect(verifyLineTotal("customers", { line_total: 5 })).toBeNull();
    expect(verifyLineTotal("service_operations", { price_pending: true, unit_price: null, quantity: 1, line_total: 0, tax_mode: "NONE", tax_rate: 0 })).toBeNull();
    expect(verifyLineTotal("sale_items", { id: "x", line_total: 12 })).toBeNull();
  });
});
