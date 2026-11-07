import { describe, expect, it } from "vitest";
import { addProductLine, parseLine, type DraftLine } from "./draft";
import { stepQuantity } from "@/lib/utils/quantity";
import type { Product } from "@/types";

const product = (over: Partial<Product> = {}): Product => ({
  id: "p1",
  business_id: "b",
  name: "Zincir 3/8",
  unit: "ADET",
  is_serial_tracked: false,
  default_sale_price: 450,
  default_tax_mode: "INCLUSIVE",
  default_tax_rate: 20,
  stock_available: 5,
  stock_damaged: 0,
  created_at: "",
  updated_at: "",
  ...over,
});

describe("satış satırları (K-109)", () => {
  it("ürün eklenince fiyatı ve KDV'si form biçiminde gelir", () => {
    const [line] = addProductLine([], product());
    expect(line).toMatchObject({ productId: "p1", quantity: "1", price: "450,00", taxRate: "20", discount: "" });
  });

  it("aynı ürün yeniden eklenince yeni satır açılmaz, miktar artar", () => {
    const lines = addProductLine(addProductLine([], product()), product());
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe("2");
  });

  it("makinede (seri takipli) her birim ayrı satırdır", () => {
    const machine = product({ id: "m1", is_serial_tracked: true });
    expect(addProductLine(addProductLine([], machine), machine)).toHaveLength(2);
  });

  it("geçerli satırı kuruşa çevirir, geçersizde nedenini söyler", () => {
    const [line] = addProductLine([], product());
    expect(parseLine({ ...line, quantity: "2", discount: "10" })).toEqual({ ok: true, quantity: 2, unitPriceKurus: 45000, discountKurus: 1000, taxRate: 20 });
    const bad: DraftLine = { ...line, quantity: "0" };
    expect(parseLine(bad)).toEqual({ ok: false, error: "“Zincir 3/8”: miktar sıfırdan büyük olmalıdır." });
    expect(parseLine({ ...line, taxRate: "120" }).ok).toBe(false);
  });
});

describe("stepQuantity", () => {
  it("bir artırır / azaltır, en az değerin altına inmez", () => {
    expect(stepQuantity("2", 1)).toBe("3");
    expect(stepQuantity("1", -1)).toBe("1");
    expect(stepQuantity("1,5", 1)).toBe("2,5");
    expect(stepQuantity("", 1)).toBe("1");
    expect(stepQuantity("0", -1, 0)).toBe("0");
  });
});
