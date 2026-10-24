import { describe, expect, it } from "vitest";
import { fitWithin } from "./resize";

describe("fotoğraf küçültme (FR-028)", () => {
  it("uzun kenarı 1600 px'e sığdırır, oranı korur", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("küçük görseli büyütmez", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("çok ince görselde en az 1 piksel bırakır, geçersiz boyutu reddeder", () => {
    expect(fitWithin(100000, 10)).toEqual({ width: 1600, height: 1 });
    expect(() => fitWithin(0, 100)).toThrow();
  });
});
