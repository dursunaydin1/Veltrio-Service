import { describe, expect, it } from "vitest";
import { formatCurrency, formatKurus, formatQuantity, moneyInput, moneyInputFromKurus } from "./currency";
import { parseMoneyInput } from "@/lib/calc";

describe("formatQuantity", () => {
  it.each([
    [10, "10"],
    [0, "0"],
    [2.5, "2,5"],
    [0.0001, "0,0001"],
    [1234.5, "1.234,5"],
    [-3, "-3"],
  ])("%s → %s", (value, expected) => {
    expect(formatQuantity(value)).toBe(expected);
  });
});

describe("kuruş ve form biçimi", () => {
  it("kuruşu TL olarak gösterir", () => {
    expect(formatKurus(123450).replace(/\s/g, " ")).toBe(formatCurrency(1234.5).replace(/\s/g, " "));
  });

  it("form kutusu tutarı binlik ayırıcısız ve virgüllüdür; parseMoneyInput geri okur", () => {
    expect(moneyInput(1234.5)).toBe("1234,50");
    expect(moneyInputFromKurus(123450)).toBe("1234,50");
    expect(parseMoneyInput(moneyInput(0.1 + 0.2))).toBe(30);
  });
});
