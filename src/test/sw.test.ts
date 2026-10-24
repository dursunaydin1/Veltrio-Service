import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sw = fs.readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf-8");
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../public/manifest.json"), "utf-8"));

describe("service worker kuralları (Adım 7.1)", () => {
  it("API, giriş ve kimlik doğrulama yolları asla önbelleğe alınmaz", () => {
    const line = sw.split("\n").find((l) => l.startsWith("const NEVER_CACHE")) ?? "";
    for (const p of ["api", "auth", "login", "register", "forgot-password", "reset-password"]) {
      expect(line).toContain(p);
    }
  });

  it("yalnızca yönlendirilmemiş, başarılı HTML yanıtları sayfa önbelleğine girer", () => {
    expect(sw).toMatch(/response\.ok/);
    expect(sw).toMatch(/!response\.redirected/);
    expect(sw).toMatch(/text\/html/);
  });

  it("çevrimdışı yedek sayfası ve yalnızca GET istekleri ele alınır", () => {
    expect(sw).toContain('OFFLINE_URL = "/offline"');
    expect(sw).toMatch(/request\.method !== "GET"\) return/);
  });
});

describe("PWA bildirimi (manifest)", () => {
  it("kurulabilir: ad, başlangıç adresi, bağımsız görünüm ve 192/512 simgeleri", () => {
    expect(manifest).toMatchObject({ display: "standalone", lang: "tr", start_url: "/dashboard" });
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.resolve(__dirname, "../../public", icon.src.replace(/^\//, "")))).toBe(true);
    }
  });
});
