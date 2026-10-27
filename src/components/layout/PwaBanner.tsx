"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getIssueCount } from "@/lib/sync/queue";
import { getStorageHealth, installHint, storageWarning, type InstallHint, type StorageHealth } from "@/lib/pwa";
import { useSessionStore } from "@/stores/session";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "veltrio_pwa_dismissed";
const STORAGE_DISMISS_KEY = "veltrio_storage_notice_dismissed";

/**
 * Üstte görünen uyarılar (Adım 7.1, NFR-008): (1) tarayıcı yerel veriyi silebilir / depolama doluyor,
 * (2) uygulamayı ana ekrana ekleme ipucu (Android: tek dokunuş, iOS: “Paylaş → Ana Ekrana Ekle”).
 * Kapatılan ipucu bir hafta tekrar gösterilmez. Kalıcı depolama izni yok uyarısı bilgi amaçlıdır ve
 * kapatılabilir (bir hafta); depolama dolu / desteklenmiyor uyarıları sorun sürdükçe görünür.
 */
export function PwaBanner() {
  const businessId = useSessionStore((s) => s.business?.id);
  const pending = useLiveQuery(async () => (businessId ? (await getIssueCount(businessId)).pending : 0), [businessId], 0);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [hint, setHint] = useState<InstallHint>("none");
  const [dismissed, setDismissed] = useState(true);
  const [storageDismissed, setStorageDismissed] = useState(true);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void getStorageHealth().then(setHealth);
    let until = 0;
    let storageUntil = 0;
    try {
      until = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
      storageUntil = Number(window.localStorage.getItem(STORAGE_DISMISS_KEY) ?? 0);
    } catch {
      // Depolama kapalıysa ipucu her seferinde gösterilir.
    }
    setDismissed(Date.now() < until);
    setStorageDismissed(Date.now() < storageUntil);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setHint(installHint({ standalone, hasPrompt: false, userAgent: navigator.userAgent }));
    /* eslint-enable react-hooks/set-state-in-effect */
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
      setHint("prompt");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Yalnızca "kalıcı depolama izni yok" uyarısı kapatılabilir; dolu/desteklenmiyor uyarıları kalır.
  const softWarning = !!health && health.supported && health.persisted === false && !(health.quota && health.usage && health.usage / health.quota > 0.8);
  const rawWarning = health ? storageWarning(health, pending ?? 0) : null;
  const showInstall = !dismissed && (hint === "prompt" || hint === "ios");
  // Ana ekrana ekleme önerisi görünüyorsa aynı şeyi söyleyen depolama bilgisi ayrıca gösterilmez.
  const warning = softWarning && (storageDismissed || showInstall) ? null : rawWarning;

  function remember(key: string) {
    try {
      window.localStorage.setItem(key, String(Date.now() + 7 * 86_400_000));
    } catch {
      // yok sayılır
    }
  }

  function dismiss() {
    setDismissed(true);
    remember(DISMISS_KEY);
  }

  function dismissStorage() {
    setStorageDismissed(true);
    remember(STORAGE_DISMISS_KEY);
  }

  if (!warning && !showInstall) return null;
  return (
    <div className="stack stack-sm no-print pwa-banner" style={{ marginBottom: 12 }}>
      {warning ? (
        <div className={`alert ${softWarning ? "alert-info" : "alert-warning"}`} role="status">
          <p>{warning}</p>
          {softWarning ? (
            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: -10, color: "inherit" }} onClick={dismissStorage}>
                Anladım
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {showInstall ? (
        <div className="alert alert-success" role="note">
          <p>
            {hint === "ios"
              ? "Uygulamayı ana ekrana ekleyin: Safari’de Paylaş düğmesine, ardından “Ana Ekrana Ekle”ye dokunun. Böylece çevrimdışı da açılır."
              : "Uygulamayı ana ekrana ekleyin; çevrimdışı da açılır ve daha hızlıdır."}
          </p>
          <div className="row row-gap-sm">
            {hint === "prompt" && prompt ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void prompt.prompt().then(() => setPrompt(null))}>Ana ekrana ekle</button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>Sonra</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
