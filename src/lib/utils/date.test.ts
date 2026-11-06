import { describe, expect, it } from "vitest";
import { addDaysToLocalDate, formatDate, localDateOf } from "./date";

describe("tarih yardımcıları (K-105)", () => {
  it("yalnızca tarih takvim günüdür, saat dilimiyle kaymaz", () => {
    expect(formatDate("2026-11-06")).toBe("06.11.2026");
    expect(formatDate("2026-01-01")).toBe("01.01.2026");
  });

  it("an İstanbul saatine çevrilir", () => {
    // 22:30 UTC = ertesi gün 01:30 İstanbul
    expect(formatDate("2026-06-15T22:30:00Z")).toBe("16.06.2026");
  });

  it("gece yarısından sonra Türkiye günü UTC gününden ileridedir", () => {
    const at = new Date("2026-11-05T22:30:00Z"); // İstanbul: 6 Kasım 01:30
    expect(at.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(localDateOf(at)).toBe("2026-11-06");
  });

  it("gün ekleme ay ve yıl sınırını geçer", () => {
    expect(addDaysToLocalDate("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDaysToLocalDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});
