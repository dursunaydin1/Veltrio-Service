import { describe, expect, it } from "vitest";
import { foldText } from "./search";

describe("foldText", () => {
  it.each([
    ["ALI", "ali"],
    ["Alı", "ali"],
    ["İSMAİL", "ismail"],
    ["Isparta", "isparta"],
    ["Çamlıca Köyü", "camlica koyu"],
    ["Şükrü Öğüt", "sukru ogut"],
  ])("%s → %s", (input, expected) => {
    expect(foldText(input)).toBe(expected);
  });

  it("Türkçe karaktersiz yazılan arama, Türkçe karakterli kayıtla eşleşir", () => {
    expect(foldText("Çamlıca").includes(foldText("camlica"))).toBe(true);
    expect(foldText("Şükrü").includes(foldText("SUKRU"))).toBe(true);
  });
});
