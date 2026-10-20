import { describe, expect, it } from "vitest";
import { calculateTax } from "./currency";

describe("calculateTax", () => {
  it("KDV hariç tutara KDV ekler", () => {
    expect(calculateTax(100, 20, "EXCLUSIVE")).toEqual({
      netAmount: 100,
      taxAmount: 20,
      grossAmount: 120,
    });
  });

  it("KDV dahil tutardan KDV'yi ayırır", () => {
    expect(calculateTax(120, 20, "INCLUSIVE")).toEqual({
      netAmount: 100,
      taxAmount: 20,
      grossAmount: 120,
    });
  });

  it("NONE modunda vergi uygulamaz", () => {
    expect(calculateTax(50, 20, "NONE")).toEqual({
      netAmount: 50,
      taxAmount: 0,
      grossAmount: 50,
    });
  });
});
