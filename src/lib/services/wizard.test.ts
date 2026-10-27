import { describe, expect, it } from "vitest";
import { addDaysToLocalDate, hasIssue, initialWizardStep, toggleIssue, UNKNOWN_MACHINE, wizardStepError } from "./wizard";

const empty = { customerId: "", machineId: "", tempType: "", complaint: "" };

describe("servis kabul adımları", () => {
  it("her adım kendinden önceki bilgileri de ister", () => {
    expect(wizardStepError(0, empty)).toMatch(/Müşteri/);
    expect(wizardStepError(0, { ...empty, customerId: "c" })).toBeNull();
    expect(wizardStepError(1, { ...empty, customerId: "c" })).toMatch(/Makine/);
    expect(wizardStepError(1, { ...empty, customerId: "c", machineId: UNKNOWN_MACHINE })).toMatch(/türünü/);
    expect(wizardStepError(1, { ...empty, customerId: "c", machineId: UNKNOWN_MACHINE, tempType: "Testere" })).toBeNull();
    expect(wizardStepError(2, { ...empty, customerId: "c", machineId: "m", complaint: "  " })).toMatch(/şikâyet/);
    expect(wizardStepError(3, { customerId: "c", machineId: "m", tempType: "", complaint: "Çalışmıyor" })).toBeNull();
  });

  it("QR veya makine sayfasından gelindiğinde şikâyet adımından başlar", () => {
    expect(initialWizardStep({ customerId: "", machineId: "" })).toBe(0);
    expect(initialWizardStep({ customerId: "c", machineId: "" })).toBe(1);
    expect(initialWizardStep({ customerId: "c", machineId: "m" })).toBe(2);
  });

  it("tarihe gün ekler; ay ve yıl geçişleri doğru", () => {
    expect(addDaysToLocalDate("2026-10-27", 1)).toBe("2026-10-28");
    expect(addDaysToLocalDate("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDaysToLocalDate("2026-12-29", 7)).toBe("2027-01-05");
    expect(addDaysToLocalDate("2026-10-27", 0)).toBe("2026-10-27");
  });

  it("hızlı arıza başlığı dokununca eklenir, ikinci dokunuşta çıkar", () => {
    let c = toggleIssue("", "Çalışmıyor");
    expect(c).toBe("Çalışmıyor");
    c = toggleIssue(c, "Güç kaybı");
    expect(c).toBe("Çalışmıyor, Güç kaybı");
    expect(hasIssue(c, "güç kaybı")).toBe(true);
    c = toggleIssue(c, "Çalışmıyor");
    expect(c).toBe("Güç kaybı");
    expect(hasIssue(c, "Çalışmıyor")).toBe(false);
  });
});
