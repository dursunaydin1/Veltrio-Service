import { describe, expect, it } from "vitest";
import {
  CALC_VERSION,
  calcDocument,
  calcLine,
  distributeAmount,
  fromKurus,
  lineGross,
  normalizeNumberInput,
  parseMoneyInput,
  parseQuantityInput,
  toKurus,
} from "./calc";

describe("toKurus / fromKurus", () => {
  it.each([
    [1234.5, 123450],
    ["1234,50", 123450],
    ["1.5", 150],
    [0, 0],
    // float ile 1.005 * 100 = 100.49999... çıkar; metin üzerinden doğru yuvarlanır
    [1.005, 101],
    ["0,004", 0],
    ["0,005", 1],
  ])("%s → %s kuruş", (input, expected) => {
    expect(toKurus(input)).toBe(expected);
  });

  it("negatif ve geçersiz girdiyi reddeder", () => {
    expect(() => toKurus(-1)).toThrow(RangeError);
    expect(() => toKurus("abc")).toThrow(RangeError);
    expect(() => toKurus("")).toThrow(RangeError);
  });

  it("fromKurus veritabanı değerine çevirir", () => {
    expect(fromKurus(123450)).toBe(1234.5);
  });

  it("0.1 + 0.2 sorunu yaşanmaz", () => {
    expect(toKurus(0.1) + toKurus(0.2)).toBe(toKurus(0.3));
  });
});

describe("calcLine", () => {
  it("EXCLUSIVE: vergi üstüne eklenir", () => {
    expect(
      calcLine({ unitPrice: 10000, quantity: 1, taxMode: "EXCLUSIVE", taxRate: 20 })
    ).toEqual({ net: 10000, tax: 2000, total: 12000, discount: 0 });
  });

  it("INCLUSIVE: vergi içinden ayrılır, toplam değişmez", () => {
    expect(
      calcLine({ unitPrice: 12000, quantity: 1, taxMode: "INCLUSIVE", taxRate: 20 })
    ).toEqual({ net: 10000, tax: 2000, total: 12000, discount: 0 });
  });

  it("NONE: vergi yok", () => {
    expect(
      calcLine({ unitPrice: 5000, quantity: 2, taxMode: "NONE", taxRate: 20 })
    ).toEqual({ net: 10000, tax: 0, total: 10000, discount: 0 });
  });

  it("ondalıklı miktar (TC-013): 2,5 litre × 80,00 ₺", () => {
    const line = calcLine({ unitPrice: 8000, quantity: "2,5", taxMode: "NONE", taxRate: 0 });
    expect(line.total).toBe(20000);
  });

  it("satır indirimi vergiden önce düşülür", () => {
    expect(
      calcLine({
        unitPrice: 10000,
        quantity: 2,
        discount: 5000,
        taxMode: "EXCLUSIVE",
        taxRate: 20,
      })
    ).toEqual({ net: 15000, tax: 3000, total: 18000, discount: 5000 });
  });

  it("kuruş yuvarlaması: INCLUSIVE 100,00 ₺ %18 → net 84,75, KDV 15,25", () => {
    const line = calcLine({ unitPrice: 10000, quantity: 1, taxMode: "INCLUSIVE", taxRate: 18 });
    expect(line).toMatchObject({ net: 8475, tax: 1525, total: 10000 });
  });

  it("net + vergi her zaman toplama eşit (INCLUSIVE)", () => {
    for (const price of [1, 99, 333, 12345, 99999]) {
      const l = calcLine({ unitPrice: price, quantity: "1,333", taxMode: "INCLUSIVE", taxRate: "18,5" });
      expect(l.net + l.tax).toBe(l.total);
    }
  });

  it("geçersiz girdileri reddeder", () => {
    const base = { quantity: 1, taxMode: "NONE" as const, taxRate: 0 };
    expect(() => calcLine({ ...base, unitPrice: 10.5 })).toThrow(RangeError);
    expect(() => calcLine({ ...base, unitPrice: -1 })).toThrow(RangeError);
    expect(() => calcLine({ ...base, unitPrice: 100, discount: 200 })).toThrow(RangeError);
    expect(() => calcLine({ ...base, unitPrice: 100, taxRate: 101 })).toThrow(RangeError);
  });
});

describe("calcDocument", () => {
  it("belge toplamı yuvarlanmış satır toplamlarının toplamıdır", () => {
    const a = calcLine({ unitPrice: 10000, quantity: 1, taxMode: "INCLUSIVE", taxRate: 18 });
    const b = calcLine({ unitPrice: 5050, quantity: 3, discount: 100, taxMode: "EXCLUSIVE", taxRate: 20 });
    const doc = calcDocument([a, b]);

    expect(doc.total).toBe(a.total + b.total);
    expect(doc.taxTotal).toBe(a.tax + b.tax);
    expect(doc.discountTotal).toBe(100);
    expect(doc.subtotal + doc.taxTotal).toBe(doc.total);
    expect(doc.calcVersion).toBe(CALC_VERSION);
  });

  it("boş belge sıfırdır", () => {
    expect(calcDocument([]).total).toBe(0);
  });
});

describe("Türkçe sayı girişi", () => {
  it.each([
    ["1.234,50", "1234.50"],
    ["1234,5", "1234.5"],
    ["1234.5", "1234.5"],
    ["1.234", "1234"],
    ["1.234.567", "1234567"],
    ["12,5", "12.5"],
    [" 7 ", "7"],
  ])("normalizeNumberInput(%s) → %s", (input, expected) => {
    expect(normalizeNumberInput(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "-5", "1.2.3", "12a"])("geçersiz: %s", (input) => {
    expect(normalizeNumberInput(input)).toBeNull();
  });

  it("parseMoneyInput kuruş döner", () => {
    expect(parseMoneyInput("1.234,50")).toBe(123450);
    expect(parseMoneyInput("0")).toBe(0);
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("")).toBeNull();
  });

  it("parseQuantityInput 4 ondalığa kadar kabul eder", () => {
    expect(parseQuantityInput("2,5")).toBe(2.5);
    expect(parseQuantityInput("0,0001")).toBe(0.0001);
    expect(parseQuantityInput("10")).toBe(10);
    expect(parseQuantityInput("-1")).toBeNull();
  });
});

describe("lineGross", () => {
  it("birim fiyat × miktar, kuruş yuvarlamasıyla", () => {
    expect(lineGross(8000, "2,5")).toBe(20000);
    expect(lineGross(333, 3)).toBe(999);
    expect(lineGross(1, "0,5")).toBe(1); // 0,5 kuruş yarımlar yukarı
    expect(() => lineGross(10.5, 1)).toThrow(RangeError);
  });
});

describe("distributeAmount", () => {
  it("toplamı tam korur: kuruş kaybolmaz", () => {
    for (const [weights, total] of [
      [[100, 100, 100], 100],
      [[1, 1, 1], 1],
      [[333, 333, 334], 7],
      [[5000, 12000, 250], 999],
    ] as const) {
      const shares = distributeAmount([...weights], total);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      expect(shares.every((s) => s >= 0)).toBe(true);
    }
  });

  it("orantılı dağıtır; kalan kuruş en büyük kalana gider", () => {
    expect(distributeAmount([100, 300], 40)).toEqual([10, 30]);
    expect(distributeAmount([1, 1, 1], 100)).toEqual([34, 33, 33]);
  });

  it("sıfır tutar ve sıfır ağırlıklı satır", () => {
    expect(distributeAmount([5, 0, 5], 10)).toEqual([5, 0, 5]);
    expect(distributeAmount([5, 5], 0)).toEqual([0, 0]);
  });

  it("tutar toplam ağırlığa eşitse her satır kendi ağırlığını alır", () => {
    expect(distributeAmount([700, 0, 300], 1000)).toEqual([700, 0, 300]);
  });

  it("geçersiz girdileri reddeder", () => {
    expect(() => distributeAmount([0, 0], 5)).toThrow(RangeError);
    expect(() => distributeAmount([1, -1], 5)).toThrow(RangeError);
    expect(() => distributeAmount([1], -5)).toThrow(RangeError);
  });
});
