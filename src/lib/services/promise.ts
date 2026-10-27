/** Teslim sözünü insan diliyle anlatır: "Bugün teslim", "Yarın teslim", "2 gün gecikti"… */
export function describePromise(promised: string | undefined, today: string): { text: string; tone: "danger" | "warn" | "muted" } | null {
  if (!promised) return null;
  const diff = Math.round((Date.parse(`${promised}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff < 0) return { text: `${-diff} gün gecikti`, tone: "danger" };
  if (diff === 0) return { text: "Bugün teslim", tone: "warn" };
  if (diff === 1) return { text: "Yarın teslim", tone: "warn" };
  return { text: `${diff} gün sonra teslim`, tone: "muted" };
}
