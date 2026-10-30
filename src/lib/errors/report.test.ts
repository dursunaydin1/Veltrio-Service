import { describe, expect, it } from "vitest";
import { errorRecord } from "./report";

describe("hata kaydı", () => {
  it("Error nesnesinden mesaj, yığın ve özet kodu alır", () => {
    const e = Object.assign(new Error("Kayıt bulunamadı"), { digest: "abc123" });
    const r = errorRecord(e, { url: "/services/1", userAgent: "Test" });
    expect(r).toMatchObject({ message: "Kayıt bulunamadı", digest: "abc123", url: "/services/1", user_agent: "Test" });
    expect(r.stack).toContain("Kayıt bulunamadı");
  });

  it("metin ya da bilinmeyen değerleri de kaydeder", () => {
    expect(errorRecord("ağ hatası").message).toBe("ağ hatası");
    expect(errorRecord({ x: 1 }).message).toBe("Bilinmeyen hata");
  });

  it("uzun alanları veritabanı sınırına keser", () => {
    const r = errorRecord(new Error("x".repeat(5000)), { url: "/" + "a".repeat(2000) });
    expect(r.message).toHaveLength(2000);
    expect(r.url).toHaveLength(1000);
  });
});
