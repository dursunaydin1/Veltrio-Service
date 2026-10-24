import { describe, expect, it } from "vitest";
import { isLabelSizeId, parseScan, qrPath, qrUrl } from "./payload";

const ID = "11111111-1111-4111-8111-111111111111";

describe("QR içeriği ve okuma (AC-003, AC-035)", () => {
  it("QR yalnızca adres ve kimlik taşır", () => {
    expect(qrPath("machine", ID)).toBe(`/machines/${ID}`);
    expect(qrUrl("https://servis.example/", "product", ID)).toBe(`https://servis.example/products/${ID}`);
  });

  it("makine ve ürün adreslerini, alan adı farklı olsa da uygulama içi yola çevirir", () => {
    expect(parseScan(`https://eski-adres.example/machines/${ID}`)).toEqual({ ok: true, path: `/machines/${ID}`, kind: "machine" });
    expect(parseScan(`https://x.example/products/${ID}?a=1`)).toEqual({ ok: true, path: `/products/${ID}`, kind: "product" });
    expect(parseScan(`/machines/${ID.toUpperCase()}`)).toEqual({ ok: true, path: `/machines/${ID}`, kind: "machine" });
  });

  it("tanınmayan veya bozuk içeriği reddeder", () => {
    expect(parseScan("").ok).toBe(false);
    expect(parseScan("merhaba").ok).toBe(false);
    expect(parseScan("https://x.example/customers/" + ID).ok).toBe(false);
    expect(parseScan("https://x.example/machines/abc").ok).toBe(false);
    expect(parseScan("http://").ok).toBe(false);
  });

  it("etiket boyutu kimliği doğrulanır", () => {
    expect(isLabelSizeId("MEDIUM")).toBe(true);
    expect(isLabelSizeId("HUGE")).toBe(false);
    expect(isLabelSizeId(undefined)).toBe(false);
  });
});
