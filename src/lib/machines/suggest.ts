/**
 * Makine formunda marka / model önerileri (K-077): önceki makine kayıtlarından, en çok kullanılan önce.
 * Marka listesi yaygın markalarla başlar; model önerileri yazılan markaya göre süzülür.
 */
export const COMMON_BRANDS = ["Stihl", "Husqvarna", "Oleo-Mac", "Efco", "Echo", "Honda", "Makita", "Solo", "Kawasaki", "Shindaiwa"];

import { foldText } from "@/lib/utils/search";

type BrandModel = { brand?: string | null; model?: string | null };

// "STIHL" ile "Stihl" aynı marka: Türkçe küçük harfte I → ı olur; foldText bunu da i'ye indirir
const key = (s: string) => foldText(s.trim());

/** Tekrarlananları birleştirip en sık kullanılan yazımı, kullanım sayısına göre sıralı döndürür. */
function rank(values: string[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const v of values) {
    const label = v.trim();
    if (!label) continue;
    const entry = counts.get(key(label));
    if (entry) entry.count += 1;
    else counts.set(key(label), { label, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "tr")).map((e) => e.label);
}

export function brandSuggestions(machines: BrandModel[]): string[] {
  const used = rank(machines.map((m) => m.brand ?? ""));
  const seen = new Set(used.map(key));
  return [...used, ...COMMON_BRANDS.filter((b) => !seen.has(key(b)))];
}

export function modelSuggestions(machines: BrandModel[], brand: string): string[] {
  const b = key(brand);
  return rank(machines.filter((m) => !b || key(m.brand ?? "") === b).map((m) => m.model ?? ""));
}
