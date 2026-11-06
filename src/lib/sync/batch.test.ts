import { describe, expect, it } from "vitest";
import { batchBySize, takeWithinBytes } from "./batch";

const sizeOf = (n: number) => n;

describe("batchBySize (K-104)", () => {
  it("kayıt sayısı sınırında böler", () => {
    const items = Array.from({ length: 250 }, () => 1);
    expect(batchBySize(items, 100, 1_000_000, sizeOf).map((b) => b.length)).toEqual([100, 100, 50]);
  });

  it("boyut sınırını aşmadan böler, sırayı korur", () => {
    expect(batchBySize([300, 300, 300, 300, 100], 100, 700, sizeOf)).toEqual([[300, 300], [300, 300, 100]]);
  });

  it("sınırdan büyük tek kayıt kendi paketinde gider", () => {
    expect(batchBySize([100, 5000, 100], 100, 1000, sizeOf)).toEqual([[100], [5000], [100]]);
  });

  it("boş liste boş paket listesi verir", () => {
    expect(batchBySize([], 100, 1000, sizeOf)).toEqual([]);
  });
});

describe("takeWithinBytes (K-104)", () => {
  it("sınırı aşmayan baştaki kayıtları alır", () => {
    expect(takeWithinBytes([400, 400, 400], 1000, (n: number) => n)).toEqual([400, 400]);
  });

  it("ilk kayıt tek başına büyükse yine de onu alır", () => {
    expect(takeWithinBytes([5000, 10], 1000, (n: number) => n)).toEqual([5000]);
  });
});
