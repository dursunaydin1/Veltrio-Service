import { describe, expect, it } from "vitest";
import { installHint, storageWarning } from "./pwa";

describe("depolama uyarısı (NFR-008, PRD §11.5)", () => {
  it("kalıcı depolama yoksa uyarır; eşitlenmemiş kayıt varsa daha sert", () => {
    expect(storageWarning({ persisted: false, supported: true }, 0)).toMatch(/silebilir/);
    expect(storageWarning({ persisted: false, supported: true }, 3)).toMatch(/eşitlenmemiş kayıtlarınız var/);
  });

  it("kalıcı depolama varsa ve alan yeterliyse uyarı yok; alan %80'i aşarsa uyarır", () => {
    expect(storageWarning({ persisted: true, supported: true, usage: 10, quota: 1000 }, 5)).toBeNull();
    expect(storageWarning({ persisted: true, supported: true, usage: 900, quota: 1000 }, 0)).toMatch(/dolmak üzere/);
  });

  it("desteklenmeyen tarayıcıda uyarır; bilinmeyen durumda (null) gürültü yapmaz", () => {
    expect(storageWarning({ persisted: null, supported: false }, 0)).toMatch(/desteklemiyor/);
    expect(storageWarning({ persisted: null, supported: true }, 0)).toBeNull();
  });
});

describe("ana ekrana ekleme ipucu", () => {
  it("kuruluysa, tarayıcı istemi varsa, iOS ise ve diğerlerinde doğru ipucu", () => {
    expect(installHint({ standalone: true, hasPrompt: false, userAgent: "" })).toBe("installed");
    expect(installHint({ standalone: false, hasPrompt: true, userAgent: "Chrome" })).toBe("prompt");
    expect(installHint({ standalone: false, hasPrompt: false, userAgent: "Mozilla (iPhone; CPU iPhone OS 17)" })).toBe("ios");
    expect(installHint({ standalone: false, hasPrompt: false, userAgent: "Firefox" })).toBe("none");
  });
});
