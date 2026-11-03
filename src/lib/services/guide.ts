/**
 * Servis rehberi (K-084): "Sonraki adım" kartı, servisin hangi işte kaldığını söyler ve o işi
 * kartın içinde yaptırır. Kullanıcı sekmeler arasında gezip neyin eksik kaldığını aramaz.
 *
 * Sıra: teşhis → işçilik / parça → müşteri kararı (gerekiyorsa) → iş → yapılan iş yazılıp tamamlanır.
 */
export type GuideStep = { id: "diagnosis" | "lines" | "approval" | "work"; label: string; done: boolean };
/** Kartın o an yaptırdığı iş; null ise durum düğmeleri (ör. "İşlemde") gösterilir. */
export type GuideTask = "diagnosis" | "lines" | "approval" | "complete" | null;

const BEFORE_WORK = new Set(["RECEIVED", "WAITING_DIAGNOSIS", "DIAGNOSED", "WAITING_CUSTOMER_APPROVAL"]);
const FINISHED = new Set(["COMPLETED", "DELIVERED"]);

export function serviceGuide(input: {
  status: string;
  diagnosis?: string;
  lineCount: number;
  needsDecision: boolean;
}): { steps: GuideStep[]; task: GuideTask } {
  const { status, lineCount, needsDecision } = input;
  const diagnosed = !!input.diagnosis?.trim() || !BEFORE_WORK.has(status);
  const finished = FINISHED.has(status);
  const steps: GuideStep[] = [
    { id: "diagnosis", label: "Teşhis", done: diagnosed },
    { id: "lines", label: "İşçilik ve parça", done: lineCount > 0 },
    { id: "approval", label: "Müşteri kararı", done: !needsDecision },
    { id: "work", label: "Yapılan iş", done: finished },
  ];

  let task: GuideTask = null;
  if (status === "CANCELLED" || finished) task = null;
  else if (!diagnosed && (status === "RECEIVED" || status === "WAITING_DIAGNOSIS")) task = "diagnosis";
  else if (BEFORE_WORK.has(status) && lineCount === 0) task = "lines";
  else if (needsDecision) task = "approval";
  else if (status === "IN_PROGRESS") task = "complete";
  return { steps, task };
}

/** "Yapılan iş" için öneri: faturalanan işlemler ve değişen parçalar (kullanıcı düzeltebilir). */
export function suggestResolution(operations: string[], parts: string[]): string {
  const ops = operations.map((o) => o.trim()).filter(Boolean);
  const changed = parts.map((p) => p.trim()).filter(Boolean);
  return [ops.join(", "), changed.length ? `Değişen parça: ${changed.join(", ")}` : ""].filter(Boolean).join(". ");
}
