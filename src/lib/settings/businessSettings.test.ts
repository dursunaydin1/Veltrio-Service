import { describe, expect, it } from "vitest";
import { parseSettingsForm, toSettingsForm } from "./businessSettings";

describe("işletme ayarları doğrulama", () => {
  it("varsayılanlar forma çevrilir ve geri geçerli ayara döner", () => {
    const form = toSettingsForm(undefined);
    expect(form).toMatchObject({ approvalThreshold: "1000", approvalTolerance: "0", reminderDays: "1", maxOfflineDays: "30", allowNegativeStock: false });
    const result = parseSettingsForm(form);
    expect(result).toMatchObject({
      ok: true,
      settings: { service_approval_threshold: 1000, service_approval_tolerance: 0, default_service_reminder_days: 1, max_offline_days: 30, allow_negative_stock: false },
    });
  });

  it("Türkçe sayı biçimini okur (1.250,50)", () => {
    const result = parseSettingsForm({ ...toSettingsForm(undefined), approvalThreshold: "1.250,50", approvalTolerance: "25,5" });
    expect(result).toMatchObject({ ok: true, settings: { service_approval_threshold: 1250.5, service_approval_tolerance: 25.5 } });
  });

  it("geçersiz değerleri alan alan reddeder", () => {
    const result = parseSettingsForm({
      ...toSettingsForm(undefined),
      approvalThreshold: "-5",
      reminderDays: "1,5",
      maxOfflineDays: "0",
      defaultTaxRate: "120",
      receiptTerms: "x".repeat(601),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["approvalThreshold", "defaultTaxRate", "maxOfflineDays", "receiptTerms", "reminderDays"]);
    }
  });

  it("boş fiş koşulları ayardan kaldırılır", () => {
    const result = parseSettingsForm({ ...toSettingsForm({ receipt_terms: "Eski" } as never), receiptTerms: "  " });
    expect(result.ok && result.settings.receipt_terms).toBeUndefined();
  });
});
