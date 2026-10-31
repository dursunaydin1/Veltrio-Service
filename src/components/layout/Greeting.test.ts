import { describe, expect, it } from "vitest";
import { firstName, greetingFor } from "./Greeting";

describe("ana sayfa selamı", () => {
  it("saate göre selam verir", () => {
    expect(greetingFor(3)).toBe("İyi geceler");
    expect(greetingFor(8)).toBe("Günaydın");
    expect(greetingFor(14)).toBe("İyi günler");
    expect(greetingFor(20)).toBe("İyi akşamlar");
  });

  it("kullanıcının, yoksa işletme sahibinin ilk adını alır", () => {
    expect(firstName("  Dursun Aydın ", "Ali Veli")).toBe("Dursun");
    expect(firstName("", "Ali Veli")).toBe("Ali");
    expect(firstName(undefined, null)).toBe("");
  });
});
