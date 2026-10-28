/**
 * Üst çubuktaki eşitleme göstergesinin durumu (K-045).
 * Eşitleme otomatik olduğundan yalnızca dikkat gereken durumlar gösterilir:
 * çevrimdışı, sorunlu kayıt, eşitleme denemesi başarısız, ilk indirme sürüyor,
 * uzun süre gönderilemeyen kayıt.
 */
export type SyncIndicatorTone = "hidden" | "offline" | "problem" | "failed" | "loading" | "pending";

export function syncIndicatorTone(s: {
  isOnline: boolean;
  problems: number;
  pending: number;
  pendingLong: boolean;
  syncStatus?: "idle" | "running" | "failed";
  /** Sunucudan tüm veri baştan iniyor (ilk açılış / kendini onarma) */
  pullingAll?: boolean;
}): SyncIndicatorTone {
  if (!s.isOnline) return "offline";
  if (s.problems > 0) return "problem";
  if (s.syncStatus === "failed") return "failed";
  if (s.pullingAll) return "loading";
  if (s.pending > 0 && s.pendingLong) return "pending";
  return "hidden";
}
