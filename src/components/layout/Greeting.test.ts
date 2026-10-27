import { describe, expect, it } from "vitest";
import { greetingFor } from "./Greeting";

describe("greetingFor", () => {
  it("saate göre selam verir", () => {
    expect(greetingFor(3)).toBe("İyi geceler");
    expect(greetingFor(8)).toBe("Günaydın");
    expect(greetingFor(14)).toBe("İyi günler");
    expect(greetingFor(21)).toBe("İyi akşamlar");
  });
});
