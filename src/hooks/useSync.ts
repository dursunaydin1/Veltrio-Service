"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSessionStore } from "@/stores/session";
import { syncNow, type SyncSummary } from "@/lib/sync/client";

const SYNC_REQUEST_EVENT = "veltrio:sync-requested";
/** Başarısız eşitlemeden sonra yeniden deneme aralıkları (ms); son değer tekrar eder. */
const RETRY_DELAYS = [15_000, 30_000, 60_000, 120_000];

export function useSync() {
  const { business, device, isOnline } = useSessionStore();
  const runningSync = useRef<Promise<SyncSummary> | null>(null);
  const retryTimer = useRef<number | null>(null);
  const failures = useRef(0);

  const runSync = useCallback((): Promise<SyncSummary> => {
    if (!business || !device) {
      return Promise.reject(new Error("Eşitleme için önce işletme ve cihaz kaydı gerekir."));
    }
    if (runningSync.current) return runningSync.current;

    const { setSyncStatus } = useSessionStore.getState();
    setSyncStatus("running");
    const task = syncNow(business.id, device.device_code)
      .then((summary) => {
        failures.current = 0;
        setSyncStatus("idle");
        return summary;
      })
      .catch((error: unknown) => {
        // Başarısız eşitleme kendiliğinden yeniden denenir (internet/sunucu geçici olarak yoksa)
        setSyncStatus("failed");
        const delay = RETRY_DELAYS[Math.min(failures.current, RETRY_DELAYS.length - 1)];
        failures.current += 1;
        if (retryTimer.current) window.clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(() => window.dispatchEvent(new Event(SYNC_REQUEST_EVENT)), delay);
        throw error;
      })
      .finally(() => {
        if (runningSync.current === task) runningSync.current = null;
      });
    runningSync.current = task;
    return task;
  }, [business, device]);

  useEffect(() => {
    if (!business || !device || !isOnline) return;

    const handleSyncRequest = () => {
      void runSync().catch((error: unknown) => {
        console.error("Otomatik eşitleme başarısız:", error);
      });
    };

    handleSyncRequest();
    window.addEventListener("online", handleSyncRequest);
    window.addEventListener("focus", handleSyncRequest);
    window.addEventListener(SYNC_REQUEST_EVENT, handleSyncRequest);

    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
      window.removeEventListener("online", handleSyncRequest);
      window.removeEventListener("focus", handleSyncRequest);
      window.removeEventListener(SYNC_REQUEST_EVENT, handleSyncRequest);
    };
  }, [business, device, isOnline, runSync]);

  return { syncNow: runSync };
}
