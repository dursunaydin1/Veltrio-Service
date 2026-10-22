import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { formatDocumentNo } from "@/lib/utils/id";
import { istanbulYear } from "@/lib/utils/date";
import { nextDocumentNo } from "./numbering";

describe("formatDocumentNo", () => {
  it.each([
    ["service", "S-DEMO-AB23-2026-00001"],
    ["sale", "SAT-DEMO-AB23-2026-00001"],
    ["purchase", "AL-DEMO-AB23-2026-00001"],
    ["return", "IAD-DEMO-AB23-2026-00001"],
    ["machine", "MK-DEMO-AB23-00001"],
    ["serialUnit", "SB-DEMO-AB23-00001"],
  ] as const)("%s → %s", (kind, expected) => {
    expect(formatDocumentNo(kind, "DEMO-AB23", 1, 2026)).toBe(expected);
  });

  it("geçersiz sıra numarasını reddeder", () => {
    expect(() => formatDocumentNo("sale", "DEMO-AB23", 0, 2026)).toThrow(RangeError);
    expect(() => formatDocumentNo("sale", "DEMO-AB23", 1.5, 2026)).toThrow(RangeError);
  });
});

describe("istanbulYear", () => {
  it("yıl sonu UTC'de Türkiye yeni yılda olabilir", () => {
    expect(istanbulYear(new Date("2026-12-31T22:30:00Z"))).toBe(2027);
    expect(istanbulYear(new Date("2026-12-31T20:30:00Z"))).toBe(2026);
  });
});

describe("nextDocumentNo", () => {
  beforeEach(async () => {
    await db.counters.clear();
  });

  const day = new Date("2026-06-15T10:00:00Z");

  it("sırayla artar", async () => {
    expect(await nextDocumentNo("sale", "DEMO-AB23", day)).toBe("SAT-DEMO-AB23-2026-00001");
    expect(await nextDocumentNo("sale", "DEMO-AB23", day)).toBe("SAT-DEMO-AB23-2026-00002");
  });

  it("aynı anda istenen numaralar çakışmaz", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () => nextDocumentNo("service", "DEMO-AB23", day))
    );
    expect(new Set(numbers).size).toBe(20);
  });

  it("her tür, cihaz ve yıl ayrı sayaç kullanır", async () => {
    expect(await nextDocumentNo("sale", "DEMO-AB23", day)).toMatch(/-00001$/);
    expect(await nextDocumentNo("purchase", "DEMO-AB23", day)).toMatch(/-00001$/);
    expect(await nextDocumentNo("sale", "DEMO-ZZ99", day)).toMatch(/-00001$/);
    expect(await nextDocumentNo("sale", "DEMO-AB23", new Date("2027-03-01T10:00:00Z")))
      .toBe("SAT-DEMO-AB23-2027-00001");
  });

  it("makine ve seri birim numarası yıl değişince sıfırlanmaz", async () => {
    await nextDocumentNo("machine", "DEMO-AB23", day);
    expect(await nextDocumentNo("machine", "DEMO-AB23", new Date("2027-03-01T10:00:00Z")))
      .toBe("MK-DEMO-AB23-00002");
  });

  it("cihaz kodu olmadan çalışmaz", async () => {
    await expect(nextDocumentNo("sale", "", day)).rejects.toThrow();
  });
});
