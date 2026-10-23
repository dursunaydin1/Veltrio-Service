/**
 * Yaşlandırma ve tahsis yardımcıları (PRD §9.4, §15; Adım 5.2-5.3). Saf
 * fonksiyonlardır: veritabanına dokunmaz, tutarlar kuruş cinsinden tam sayıdır.
 */

export type AgingBandId = "NOT_DUE" | "D0_7" | "D8_30" | "D31_60" | "D60_PLUS";

export const AGING_BANDS: { id: AgingBandId; label: string }[] = [
  { id: "NOT_DUE", label: "Vadesi gelmemiş" },
  { id: "D0_7", label: "0–7 gün" },
  { id: "D8_30", label: "8–30 gün" },
  { id: "D31_60", label: "31–60 gün" },
  { id: "D60_PLUS", label: "60+ gün" },
];

const DAY_MS = 86_400_000;
const dayNumber = (isoDate: string) => Math.floor(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/**
 * Referans tarihten (vade varsa vade, yoksa belge tarihi) bugüne geçen gün.
 * Negatif: vade henüz gelmemiş. Tarihler `YYYY-MM-DD` (veya ISO tarih-saat) olabilir.
 */
export function daysOverdue(refDate: string, today: string): number {
  return dayNumber(today) - dayNumber(refDate);
}

export function bandOf(days: number): AgingBandId {
  if (days < 0) return "NOT_DUE";
  if (days <= 7) return "D0_7";
  if (days <= 30) return "D8_30";
  if (days <= 60) return "D31_60";
  return "D60_PLUS";
}

export type Agable = { refDate: string; remainingKurus: number };

/** Açık kalemleri bantlara toplar; yalnızca pozitif (borç) kalanlar sayılır. */
export function ageItems(items: Agable[], today: string): Record<AgingBandId, number> {
  const out: Record<AgingBandId, number> = { NOT_DUE: 0, D0_7: 0, D8_30: 0, D31_60: 0, D60_PLUS: 0 };
  for (const item of items) {
    if (item.remainingKurus <= 0) continue;
    out[bandOf(daysOverdue(item.refDate, today))] += item.remainingKurus;
  }
  return out;
}

export type Allocatable = { key: string; refDate: string; remainingKurus: number };
export type AllocationPart = { key: string; amountKurus: number };

/**
 * En eski kalemden başlayarak (FIFO) tutarı dağıtır. Sıralama referans tarihe
 * (vade varsa vade, yoksa belge tarihi) göredir; eşitlikte giriş sırası korunur.
 * Dağıtılamayan artan tutar sonuçta yer almaz (müşteri alacağı / avans kalır).
 */
export function fifoAllocate(items: Allocatable[], amountKurus: number): AllocationPart[] {
  const sorted = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.remainingKurus > 0)
    .sort((a, b) => a.item.refDate.localeCompare(b.item.refDate) || a.index - b.index);
  const parts: AllocationPart[] = [];
  let left = amountKurus;
  for (const { item } of sorted) {
    if (left <= 0) break;
    const take = Math.min(left, item.remainingKurus);
    parts.push({ key: item.key, amountKurus: take });
    left -= take;
  }
  return parts;
}
