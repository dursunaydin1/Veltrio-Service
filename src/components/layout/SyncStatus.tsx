"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { getIssueCount } from "@/lib/sync/queue";
import { useSessionStore } from "@/stores/session";
import { formatDateTime } from "@/lib/utils";

const SYNC_REQUEST_EVENT = "veltrio:sync-requested";

/**
 * Her zaman görünen eşitleme göstergesi (Adım 1.12, K-012).
 * Her şey yolundayken yalnızca küçük bir simge görünür (metin ekran okuyucu
 * ve ipucu için saklı); bekleyen kayıt, sorun veya çevrimdışı durumda
 * açıklayıcı metin gösterilir. Son eşitleme zamanı Menü sayfasındadır.
 * Dokunulunca eşitlemeyi hemen başlatır.
 */
export function SyncStatus() {
  const business = useSessionStore((s) => s.business);
  const isOnline = useSessionStore((s) => s.isOnline);
  const lastSyncedAt = useSessionStore((s) => s.lastSyncedAt);

  const counts = useLiveQuery(
    () => (business ? getIssueCount(business.id) : undefined),
    [business?.id]
  );

  const problems = (counts?.errors ?? 0) + (counts?.conflicts ?? 0);
  const pending = counts?.pending ?? 0;

  let tone: "ok" | "pending" | "problem" | "offline" = "ok";
  let label = lastSyncedAt ? "Eşitlendi" : "Henüz eşitlenmedi";
  let Icon = RefreshCw;

  if (!isOnline) {
    tone = "offline";
    label = pending > 0 ? `Çevrimdışı · ${pending} bekliyor` : "Çevrimdışı";
    Icon = CloudOff;
  } else if (problems > 0) {
    tone = "problem";
    label = `${problems} sorun`;
    Icon = TriangleAlert;
  } else if (pending > 0) {
    tone = "pending";
    label = `${pending} bekliyor`;
  }

  const showLabel = tone !== "ok" || !lastSyncedAt;
  const hint = lastSyncedAt
    ? `Son eşitleme: ${formatDateTime(lastSyncedAt)}. Şimdi eşitlemek için dokunun.`
    : "Şimdi eşitlemek için dokunun.";

  return (
    <button
      type="button"
      className="sync-pill"
      data-tone={tone}
      role="status"
      aria-live="polite"
      disabled={!isOnline}
      title={hint}
      onClick={() => window.dispatchEvent(new Event(SYNC_REQUEST_EVENT))}
    >
      <Icon size={16} aria-hidden="true" />
      <span className={showLabel ? undefined : "sr-only"}>{label}</span>
    </button>
  );
}
