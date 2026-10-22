import { describe, expect, it } from "vitest";
import { suggestDeviceName } from "./device";

describe("suggestDeviceName", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "Telefon"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36", "Telefon"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "Tablet"],
    ["Mozilla/5.0 (Linux; Android 14; SM-X900) Safari/537.36", "Tablet"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", "Bilgisayar"],
  ])("%s → %s", (ua, expected) => {
    expect(suggestDeviceName(ua)).toBe(expected);
  });
});
