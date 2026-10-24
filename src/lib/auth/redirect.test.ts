import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath (QR ile açılışta girişten sonra dönüş)", () => {
  it("uygulama içi yolları kabul eder", () => {
    expect(safeNextPath("/machines/abc")).toBe("/machines/abc");
    expect(safeNextPath("/services/new?customer=1&machine=2")).toBe("/services/new?customer=1&machine=2");
  });

  it("boş, dış adres ve çift eğik çizgiyi reddeder", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath("https://kotu.example/x")).toBe("/dashboard");
    expect(safeNextPath("//kotu.example")).toBe("/dashboard");
    expect(safeNextPath("/\\kotu.example")).toBe("/dashboard");
    expect(safeNextPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("giriş sayfasının kendisine veya satır sonu içeren yola dönmez", () => {
    expect(safeNextPath("/login")).toBe("/dashboard");
    expect(safeNextPath("/login?next=/x")).toBe("/dashboard");
    expect(safeNextPath("/machines/a\nSet-Cookie: x")).toBe("/dashboard");
  });
});
