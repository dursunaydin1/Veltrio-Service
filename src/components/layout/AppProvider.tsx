"use client";

import { useEffect } from "react";
import { useAuthSync, useOnlineStatus } from "@/hooks/useAuth";
import { configureOfflineLimit } from "@/lib/sync/offlineLimit";
import { useSessionStore } from "@/stores/session";
import { useReminders } from "@/hooks/useReminders";
import { usePwa } from "@/hooks/usePwa";
import { useDeviceGuard } from "@/hooks/useDeviceGuard";
import { useSync } from "@/hooks/useSync";
import { reportError } from "@/lib/errors/report";

/**
 * Uygulama genelinde hook'ları tek yerden başlatır.
 * Root layout'ta <body> içine sarılmalıdır.
 *
 * Kullanım:
 *   <AppProvider>{children}</AppProvider>
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  useAuthSync();
  useOnlineStatus();
  useSync();
  useDeviceGuard();
  usePwa();
  useEffect(() => {
    // Çevrimdışı azami gün kuralı için güncel oturum durumunu okur (AC-045)
    configureOfflineLimit({
      getLastSyncedAt: () => useSessionStore.getState().lastSyncedAt,
      getMaxDays: () => useSessionStore.getState().business?.settings?.max_offline_days,
      getIsOnline: () => useSessionStore.getState().isOnline,
    });
    return () => configureOfflineLimit(null);
  }, []);
  useEffect(() => {
    // Ekran dışında kalan beklenmeyen hatalar da sunucuya kaydedilir (K-053)
    const onError = (e: ErrorEvent) => void reportError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => void reportError(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  useReminders();
  return <>{children}</>;
}

