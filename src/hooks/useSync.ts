"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSessionStore } from "@/stores/session";
import { syncNow, type SyncSummary } from "@/lib/sync/client";

const SYNC_REQUEST_EVENT = "veltrio:sync-requested";

export function useSync() {
  const { business, device, isOnline } = useSessionStore();
  const runningSync = useRef<Promise<SyncSummary> | null>(null);

  const runSync = useCallback((): Promise<SyncSummary> => {
    if (!business || !device) {
      return Promise.reject(new Error("Eşitleme için önce işletme ve cihaz kaydı gerekir."));
    }
    if (runningSync.current) return runningSync.current;

    const task = syncNow(business.id, device.device_code).finally(() => {
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
      window.removeEventListener("online", handleSyncRequest);
      window.removeEventListener("focus", handleSyncRequest);
      window.removeEventListener(SYNC_REQUEST_EVENT, handleSyncRequest);
    };
  }, [business, device, isOnline, runSync]);

  return { syncNow: runSync };
}
