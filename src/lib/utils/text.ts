/** Addan iki harflik kısaltma (avatar): "Ali Yılmaz" → "AY", "Ayşe" → "AY". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toLocaleUpperCase("tr");
}
