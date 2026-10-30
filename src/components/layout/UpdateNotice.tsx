"use client";

import { useEffect, useState } from "react";

const CHECK_EVERY_MS = 30 * 60_000;

/**
 * "Yeni sürüm hazır" uyarısı (K-053). Yeni service worker devreye girince açık sayfa hâlâ eski kodla
 * çalışır; kullanıcıya tek dokunuşla yenileme önerilir. İlk kurulumda (öncesinde denetleyici yokken) gösterilmez.
 * Güncelleme odaklanınca ve yarım saatte bir denetlenir. Yayında yeni sürüm için public/sw.js içindeki VERSION artırılır.
 */
export function UpdateNotice() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    const onChange = () => hadController && setReady(true);
    const check = () => void navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => undefined);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, []);

  if (!ready) return null;
  return (
    <div className="notice no-print" role="status" style={{ marginBottom: 12 }}>
      <span>Uygulamanın yeni sürümü hazır.</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
        Yenile
      </button>
    </div>
  );
}
