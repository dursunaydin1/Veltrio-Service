import { describe, expect, it } from "vitest";
import { serviceGuide, suggestResolution } from "./guide";

const base = { status: "RECEIVED", diagnosis: "", lineCount: 0, needsDecision: false };

describe("servis rehberi", () => {
  it("sırayla teşhis, kalem, müşteri kararı ve tamamlama ister", () => {
    expect(serviceGuide(base).task).toBe("diagnosis");
    expect(serviceGuide({ ...base, diagnosis: "Filtre tıkalı" }).task).toBe("lines");
    expect(serviceGuide({ ...base, status: "DIAGNOSED", diagnosis: "x", lineCount: 2, needsDecision: true }).task).toBe("approval");
    expect(serviceGuide({ ...base, status: "DIAGNOSED", diagnosis: "x", lineCount: 2 }).task).toBeNull();
    expect(serviceGuide({ ...base, status: "IN_PROGRESS", lineCount: 2 }).task).toBe("complete");
    expect(serviceGuide({ ...base, status: "COMPLETED", lineCount: 2 }).task).toBeNull();
  });

  it("adımların tamamlanma durumu", () => {
    const { steps } = serviceGuide({ ...base, status: "IN_PROGRESS", lineCount: 1 });
    expect(steps.map((s) => s.done)).toEqual([true, true, true, false]);
  });

  it("yapılan iş önerisi", () => {
    expect(suggestResolution(["Karbüratör ayarı", " "], ["Misina kafası"])).toBe("Karbüratör ayarı. Değişen parça: Misina kafası");
    expect(suggestResolution([], [])).toBe("");
  });
});
