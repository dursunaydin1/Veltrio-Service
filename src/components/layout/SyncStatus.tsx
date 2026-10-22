"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { getIssueCount } from "@/lib/sync/queue";
import { useSessionStore } from "@/stores/session";
import { formatTime } from "@/lib/utils";

const SYNC_REQUEST_EVENT = "veltrio:sync-requested";

/**
 * Her zaman görünen eşitleme göstergesi (Adım 1.12):
 * bekleyen kayıt sayısı, sorunlar ve son başarılı eşitleme.
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
  let label = lastSyncedAt ? `Eşitlendi ${formatTime(lastSyncedAt)}` : "Henüz eşitlenmedi";
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

  return (
    <button
      type="button"
      className="sync-pill"
      data-tone={tone}
      role="status"
      aria-live="polite"
      disabled={!isOnline}
      title="Şimdi eşitle"
      onClick={() => window.dispatchEvent(new Event(SYNC_REQUEST_EVENT))}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
