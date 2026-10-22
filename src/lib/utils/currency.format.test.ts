import { describe, expect, it } from "vitest";
import { formatQuantity } from "./currency";

describe("formatQuantity", () => {
  it.each([
    [10, "10"],
    [0, "0"],
    [2.5, "2,5"],
    [0.0001, "0,0001"],
    [1234.5, "1.234,5"],
    [-3, "-3"],
  ])("%s → %s", (value, expected) => {
    expect(formatQuantity(value)).toBe(expected);
  });
});
