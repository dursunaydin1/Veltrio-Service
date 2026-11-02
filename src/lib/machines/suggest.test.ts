import { describe, expect, it } from "vitest";
import { brandSuggestions, COMMON_BRANDS, modelSuggestions } from "./suggest";

const machines = [
  { brand: "Stihl", model: "MS 250" },
  { brand: "stihl ", model: "MS 250" },
  { brand: "Stihl", model: "FS 55" },
  { brand: "Kolay Motor", model: "KM-1" },
];

describe("marka / model önerileri", () => {
  it("markalar: kullanılanlar sık olandan başlar, büyük-küçük harf birleşir, yaygın markalar arkada", () => {
    const list = brandSuggestions(machines);
    expect(list.slice(0, 2)).toEqual(["Stihl", "Kolay Motor"]);
    expect(list.filter((b) => b.toLowerCase() === "stihl")).toHaveLength(1);
    expect(list).toContain("Husqvarna");
    expect(brandSuggestions([])).toEqual(COMMON_BRANDS);
  });

  it("modeller yazılan markaya göre süzülür, en sık kullanılan önce", () => {
    expect(modelSuggestions(machines, "STIHL")).toEqual(["MS 250", "FS 55"]);
    expect(modelSuggestions(machines, "")).toEqual(["MS 250", "FS 55", "KM-1"]);
  });
});
