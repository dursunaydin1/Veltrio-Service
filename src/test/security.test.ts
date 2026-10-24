import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("güvenlik başlıkları ve service worker (NFR-005, NFR-008)", async () => {
  const config = require("../../next.config.js") as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
  const rules = await config.headers();
  const all = rules.find((r) => r.source === "/:path*")?.headers ?? [];
  const get = (k: string) => all.find((h) => h.key === k)?.value;

  it("HTTPS zorunlu (HSTS), içerik türü sezgisi kapalı, çerçeveye gömme engelli", () => {
    expect(get("Strict-Transport-Security")).toMatch(/max-age=\d{7,}/);
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("X-Frame-Options")).toBe("DENY");
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("kamera yalnızca uygulamaya açık (QR); mikrofon, konum ve ödeme kapalı", () => {
    const policy = get("Permissions-Policy") ?? "";
    expect(policy).toContain("camera=(self)");
    for (const off of ["microphone=()", "geolocation=()", "payment=()"]) expect(policy).toContain(off);
  });

  it("service worker önbelleğe alınmaz", () => {
    const sw = rules.find((r) => r.source === "/sw.js")?.headers ?? [];
    expect(sw.find((h) => h.key === "Cache-Control")?.value).toMatch(/no-cache/);
  });
});
