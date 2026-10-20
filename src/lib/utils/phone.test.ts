import { describe, expect, it } from "vitest";
import { isValidTurkishPhone, normalizePhone, phonesMatch } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["0532 123 45 67", "5321234567"],
    ["+90 (532) 123-45-67", "5321234567"],
    ["905321234567", "5321234567"],
    ["5321234567", "5321234567"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe("phonesMatch / isValidTurkishPhone", () => {
  it("0 ve +90 biçimlerini aynı kabul eder (AC-029)", () => {
    expect(phonesMatch("0532 123 45 67", "+90 532 123 45 67")).toBe(true);
  });

  it("geçersiz numarayı reddeder", () => {
    expect(isValidTurkishPhone("12345")).toBe(false);
    expect(isValidTurkishPhone("0532 123 45 67")).toBe(true);
  });
});
