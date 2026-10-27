/**
 * Üst çubuktaki eşitleme göstergesinin durumu (K-045).
 * Eşitleme otomatik olduğundan yalnızca dikkat gereken durumlar gösterilir.
 */
export type SyncIndicatorTone = "hidden" | "offline" | "problem" | "pending";

export function syncIndicatorTone(s: { isOnline: boolean; problems: number; pending: number; pendingLong: boolean }): SyncIndicatorTone {
  if (!s.isOnline) return "offline";
  if (s.problems > 0) return "problem";
  if (s.pending > 0 && s.pendingLong) return "pending";
  return "hidden";
}
