"use client";

import { useEffect } from "react";
import { PRECACHE_PATHS, requestPersistentStorage } from "@/lib/pwa";
import { useSessionStore } from "@/stores/session";

/**
 * Service worker'ı kaydeder (yalnızca üretimde; geliştirmede önbellek karışıklığı yaratmaması için),
 * oturum açık ve cihaz kayıtlıyken uygulama sayfalarını çevrimdışı için önceden indirtir ve kalıcı
 * depolama izni ister (Adım 7.1, NFR-008).
 */
export function usePwa(): void {
  const hasDevice = useSessionStore((s) => !!s.device);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hasDevice) return;
    void requestPersistentStorage();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const registration = await navigator.serviceWorker.ready.catch(() => undefined);
      if (!cancelled && registration?.active && navigator.onLine) {
        registration.active.postMessage({ type: "PRECACHE", urls: PRECACHE_PATHS });
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasDevice]);
}
