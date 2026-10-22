import { describe, expect, it } from "vitest";
import {
  isPlausiblePhone,
  isValidTurkishPhone,
  normalizePhone,
  phonesMatch,
  telLink,
  whatsappLink,
} from "./phone";

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

describe("isPlausiblePhone / bağlantılar", () => {
  it("sabit hat ve cep kabul edilir, kısa numara edilmez", () => {
    expect(isPlausiblePhone("0212 123 45 67")).toBe(true);
    expect(isPlausiblePhone("0532 123 45 67")).toBe(true);
    expect(isPlausiblePhone("12345")).toBe(false);
    expect(isPlausiblePhone("")).toBe(false);
  });

  it("tel ve WhatsApp bağlantıları ülke kodu ekler", () => {
    expect(telLink("0532 123 45 67")).toBe("tel:+905321234567");
    expect(whatsappLink("0532 123 45 67")).toBe("https://wa.me/905321234567");
    expect(whatsappLink("+90 532 123 45 67")).toBe("https://wa.me/905321234567");
  });

  it("yurt dışı numarası olduğu gibi kullanılır, geçersiz numara için bağlantı yok", () => {
    expect(whatsappLink("+49 151 2345 6789")).toBe("https://wa.me/4915123456789");
    expect(telLink("123")).toBeNull();
    expect(whatsappLink("")).toBeNull();
  });
});
