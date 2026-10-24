import type { BusinessSettings } from "@/types";

/**
 * İşletme ayarlarının doğrulanması (Adım 1.4, 3.8, 3.16; SR-004, SR-005, SR-014, ST-002).
 * Form metin alır; geçerliyse `BusinessSettings` parçasını (mevcut ayarlarla birleştirilecek) döner.
 */

export type SettingsFormInput = {
  approvalThreshold: string; // TL, 0 = ücretli her işte onay
  approvalTolerance: string; // TL
  reminderDays: string; // gün
  maxOfflineDays: string; // gün
  allowNegativeStock: boolean;
  defaultTaxMode: BusinessSettings["default_tax_mode"];
  defaultTaxRate: string;
  receiptTerms: string;
};

export type SettingsResult =
  | { ok: true; settings: Partial<BusinessSettings> }
  | { ok: false; errors: Partial<Record<keyof SettingsFormInput, string>> };

const num = (v: string) => (v.trim() === "" ? NaN : Number(v.trim().replace(/\./g, "").replace(",", ".")));
const plain = (v: string) => (v.trim() === "" ? NaN : Number(v.trim().replace(",", ".")));

export function parseSettingsForm(input: SettingsFormInput): SettingsResult {
  const errors: Partial<Record<keyof SettingsFormInput, string>> = {};

  const threshold = num(input.approvalThreshold);
  if (!Number.isFinite(threshold) || threshold < 0) errors.approvalThreshold = "Onay eşiği 0 veya daha büyük bir tutar olmalıdır.";
  const tolerance = num(input.approvalTolerance);
  if (!Number.isFinite(tolerance) || tolerance < 0) errors.approvalTolerance = "Tolerans 0 veya daha büyük bir tutar olmalıdır.";
  const reminder = plain(input.reminderDays);
  if (!Number.isInteger(reminder) || reminder < 0 || reminder > 30) errors.reminderDays = "Hatırlatma günü 0 ile 30 arasında tam sayı olmalıdır.";
  const offline = plain(input.maxOfflineDays);
  if (!Number.isInteger(offline) || offline < 1 || offline > 365) errors.maxOfflineDays = "Çevrimdışı süre 1 ile 365 gün arasında olmalıdır.";
  const taxRate = plain(input.defaultTaxRate);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) errors.defaultTaxRate = "KDV oranı 0 ile 100 arasında olmalıdır.";
  if (input.receiptTerms.length > 600) errors.receiptTerms = "Fiş alt metni en fazla 600 karakter olabilir.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      service_approval_threshold: threshold,
      service_approval_tolerance: tolerance,
      default_service_reminder_days: reminder,
      max_offline_days: offline,
      allow_negative_stock: input.allowNegativeStock,
      default_tax_mode: input.defaultTaxMode,
      default_tax_rate: taxRate,
      receipt_terms: input.receiptTerms.trim() || undefined,
    },
  };
}

export function toSettingsForm(s: Partial<BusinessSettings> | undefined): SettingsFormInput {
  const money = (n: number | undefined, fallback: number) => String(n ?? fallback).replace(".", ",");
  return {
    approvalThreshold: money(s?.service_approval_threshold, 1000),
    approvalTolerance: money(s?.service_approval_tolerance, 0),
    reminderDays: String(s?.default_service_reminder_days ?? 1),
    maxOfflineDays: String(s?.max_offline_days ?? 30),
    allowNegativeStock: s?.allow_negative_stock ?? false,
    defaultTaxMode: s?.default_tax_mode ?? "INCLUSIVE",
    defaultTaxRate: String(s?.default_tax_rate ?? 20),
    receiptTerms: s?.receipt_terms ?? "",
  };
}
