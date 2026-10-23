import { describe, expect, it } from "vitest";
import { ageItems, bandOf, daysOverdue, fifoAllocate } from "./aging";

describe("yaşlandırma bantları (§15, AC-046)", () => {
  it("gün sayısı bantlara doğru düşer (sınırlar dahil)", () => {
    expect(bandOf(-1)).toBe("NOT_DUE");
    expect(bandOf(0)).toBe("D0_7");
    expect(bandOf(7)).toBe("D0_7");
    expect(bandOf(8)).toBe("D8_30");
    expect(bandOf(30)).toBe("D8_30");
    expect(bandOf(31)).toBe("D31_60");
    expect(bandOf(60)).toBe("D31_60");
    expect(bandOf(61)).toBe("D60_PLUS");
  });

  it("gün farkı tarih-saatten bağımsız, takvim günü olarak hesaplanır", () => {
    expect(daysOverdue("2026-10-01T23:30:00.000Z", "2026-10-08")).toBe(7);
    expect(daysOverdue("2026-10-10", "2026-10-08")).toBe(-2);
  });

  it("yalnızca borç (pozitif kalan) sayılır; alacaklar bantlara girmez", () => {
    const aged = ageItems(
      [
        { refDate: "2026-10-05", remainingKurus: 1000 },
        { refDate: "2026-09-01", remainingKurus: 2500 },
        { refDate: "2026-11-01", remainingKurus: 400 },
        { refDate: "2026-06-01", remainingKurus: -900 },
        { refDate: "2026-06-01", remainingKurus: 0 },
      ],
      "2026-10-08"
    );
    expect(aged).toEqual({ NOT_DUE: 400, D0_7: 1000, D8_30: 0, D31_60: 2500, D60_PLUS: 0 });
  });
});

describe("FIFO tahsis (AC-040)", () => {
  const items = [
    { key: "b", refDate: "2026-09-20", remainingKurus: 3000 },
    { key: "a", refDate: "2026-08-01", remainingKurus: 2000 },
    { key: "c", refDate: "2026-10-01", remainingKurus: 5000 },
  ];

  it("en eski kalemden başlar, kalemin kalanını aşmaz", () => {
    expect(fifoAllocate(items, 4000)).toEqual([
      { key: "a", amountKurus: 2000 },
      { key: "b", amountKurus: 2000 },
    ]);
  });

  it("fazla tutar dağıtılmaz (avans olarak kalır); kalanı olmayan kalem atlanır", () => {
    const parts = fifoAllocate([...items, { key: "z", refDate: "2026-01-01", remainingKurus: 0 }], 99999);
    expect(parts.map((p) => p.key)).toEqual(["a", "b", "c"]);
    expect(parts.reduce((a, p) => a + p.amountKurus, 0)).toBe(10000);
  });

  it("sıfır veya negatif tutar boş döner", () => {
    expect(fifoAllocate(items, 0)).toEqual([]);
  });
});
