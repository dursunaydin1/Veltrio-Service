import { describe, expect, it } from "vitest";
import { describePromise } from "./promise";

describe("describePromise", () => {
  const today = "2026-10-27";
  it("tarihi insan diliyle anlatır", () => {
    expect(describePromise(undefined, today)).toBeNull();
    expect(describePromise("2026-10-25", today)).toEqual({ text: "2 gün gecikti", tone: "danger" });
    expect(describePromise("2026-10-27", today)).toEqual({ text: "Bugün teslim", tone: "warn" });
    expect(describePromise("2026-10-28", today)).toEqual({ text: "Yarın teslim", tone: "warn" });
    expect(describePromise("2026-11-03", today)).toEqual({ text: "7 gün sonra teslim", tone: "muted" });
  });
});
