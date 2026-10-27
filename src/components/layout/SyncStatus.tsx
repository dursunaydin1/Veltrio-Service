"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { getIssueCount } from "@/lib/sync/queue";
import { syncIndicatorTone } from "@/lib/sync/indicator";
import { useSessionStore } from "@/stores/session";
import { formatDateTime } from "@/lib/utils";

const SYNC_REQUEST_EVENT = "veltrio:sync-requested";
/** Bu süreden kısa bekleyen kayıtlar gösterilmez (eşitleme zaten otomatik çalışır). */
const PENDING_GRACE_MS = 15_000;

/**
 * Eşitleme göstergesi (Adım 1.12, K-012 → K-045).
 * Eşitleme otomatiktir; gösterge yalnızca dikkat gereken durumda görünür:
 * çevrimdışı, sorun (hata/çakışma) veya 15 saniyeden uzun gönderilemeyen kayıt.
 * Her şey yolundayken hiçbir şey çizilmez. Son eşitleme zamanı Menü sayfasındadır.
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

  // Bekleyen kayıt 15 sn'den uzun sürerse göster; sıfıra inince sayaç sıfırlanır.
  const [pendingLong, setPendingLong] = useState(false);
  useEffect(() => {
    if (pending === 0) {
      setPendingLong(false); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    const timer = window.setTimeout(() => setPendingLong(true), PENDING_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [pending > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const tone = syncIndicatorTone({ isOnline, problems, pending, pendingLong });
  if (tone === "hidden") return null;

  let label: string;
  let short: string | null = null;
  let Icon = RefreshCw;
  if (tone === "offline") {
    label = pending > 0 ? `Çevrimdışı · ${pending} bekliyor` : "Çevrimdışı";
    short = pending > 0 ? String(pending) : null;
    Icon = CloudOff;
  } else if (tone === "problem") {
    label = `${problems} sorun`;
    short = String(problems);
    Icon = TriangleAlert;
  } else {
    label = `${pending} kayıt gönderilemedi, bekliyor`;
    short = String(pending);
  }

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
      title={`${label}. ${hint}`}
      onClick={() => window.dispatchEvent(new Event(SYNC_REQUEST_EVENT))}
    >
      <Icon size={16} aria-hidden="true" />
      {short ? <span className="sync-short" aria-hidden="true">{short}</span> : null}
      <span className="sr-only">{label}</span>
    </button>
  );
}
