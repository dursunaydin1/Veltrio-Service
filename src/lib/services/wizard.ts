/**
 * Adım adım servis kabulü (K-044): Müşteri → Makine → Şikâyet → Ek bilgiler.
 * Her adımın "devam edilebilir mi" kontrolü burada; ekran yalnızca gösterir.
 */
export const UNKNOWN_MACHINE = "__unknown__";

export const SERVICE_WIZARD_STEPS = ["Müşteri", "Makine", "Şikâyet", "Ek bilgiler"] as const;

export type ServiceWizardState = {
  customerId: string;
  machineId: string;
  tempType: string;
  complaint: string;
};

/** Adımdaki eksik bilgi için Türkçe mesaj; eksik yoksa null. */
export function wizardStepError(step: number, s: ServiceWizardState): string | null {
  if (step >= 0 && !s.customerId) return "Müşteri seçin veya yeni müşteri ekleyin.";
  if (step >= 1) {
    if (!s.machineId) return "Makineyi seçin ya da “Makine kayıtlı değil”e dokunun.";
    if (s.machineId === UNKNOWN_MACHINE && !s.tempType.trim()) return "Makine türünü yazın (ör. Zincirli testere).";
  }
  if (step >= 2 && !s.complaint.trim()) return "Müşterinin şikâyetini seçin veya yazın.";
  return null;
}

/** Sayfa açıldığında başlanacak adım: QR/makine sayfasından gelindiyse doğrudan şikâyete geçilir. */
export function initialWizardStep(s: Pick<ServiceWizardState, "customerId" | "machineId">): number {
  if (s.customerId && s.machineId) return 2;
  if (s.customerId) return 1;
  return 0;
}

/** YYYY-AA-GG tarihine gün ekler (saat dilimi kaymasından etkilenmez). */
export function addDaysToLocalDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Teslim sözü için hızlı seçenekler. */
export const PROMISE_SHORTCUTS = [
  { label: "Bugün", days: 0 },
  { label: "Yarın", days: 1 },
  { label: "3 gün", days: 3 },
  { label: "1 hafta", days: 7 },
] as const;

/** Şikâyet metnine hızlı başlık ekler / çıkarır (dokununca aç-kapa). */
export function toggleIssue(complaint: string, label: string): string {
  const parts = complaint
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const key = label.toLocaleLowerCase("tr");
  const has = parts.some((p) => p.toLocaleLowerCase("tr") === key);
  return (has ? parts.filter((p) => p.toLocaleLowerCase("tr") !== key) : [...parts, label]).join(", ");
}

export function hasIssue(complaint: string, label: string): boolean {
  const key = label.toLocaleLowerCase("tr");
  return complaint.split(",").some((p) => p.trim().toLocaleLowerCase("tr") === key);
}
