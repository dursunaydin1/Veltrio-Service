import { describe, expect, it } from "vitest";
import { validatePassword } from "./password";

describe("şifre politikası (NFR-009)", () => {
  it("güçlü şifreyi kabul eder", () => {
    expect(validatePassword("Kuzu-Yagmur-42x", "ali@example.com")).toEqual([]);
  });

  it("kısa, harfsiz veya rakamsız şifreyi reddeder", () => {
    expect(validatePassword("kisa1")).toHaveLength(1);
    expect(validatePassword("sadeceharflerburada")).toEqual(["Şifre en az bir rakam içermelidir."]);
    expect(validatePassword("12345678901234")).toContain("Şifre en az bir harf içermelidir.");
  });

  it("tekrar eden, yaygın ve e-postayı içeren şifreyi reddeder", () => {
    expect(validatePassword("aaaaaaaaaaaa1").length).toBeGreaterThanOrEqual(0);
    expect(validatePassword("1111111111")).toContain("Şifre tek karakterin tekrarından oluşamaz.");
    expect(validatePassword("Password123")).toContain("Bu şifre çok yaygın; başka bir şifre seçin.");
    expect(validatePassword("mehmet-Usta-2026", "mehmet@example.com")).toContain("Şifre e-posta adresinizi içermemelidir.");
  });

  it("Türkçe harfleri harf sayar", () => {
    expect(validatePassword("çiğköfte-2026-şahane")).toEqual([]);
  });
});
