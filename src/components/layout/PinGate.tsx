"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { attemptUnlock, removePin, MAX_PIN_LENGTH } from "@/lib/pin/pin";
import { RELOCK_AFTER_MS, getServerSnapshot, getSnapshot, lockApp, subscribe, unlockApp } from "@/lib/pin/lockStore";

/**
 * PIN kilit ekranı (Adım 1.5, AC-020): PIN tanımlıysa uygulama açılışında ve
 * arka plandan uzun süre sonra dönüşte PIN istenir. Doğru PIN, oturum belirtecini
 * yeniler (hızlı giriş). 5 hatalı denemede geçici kilit uygulanır. PIN unutulursa
 * şifreyle yeniden giriş yapılır (PIN kaldırılır).
 */
export function PinGate({ children }: { children: React.ReactNode }) {
  const locked = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS) {
        lockApp();
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (!locked) return <>{children}</>;
  return <LockScreen />;
}

function LockScreen() {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const waitSeconds = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (waitSeconds > 0) return;
    setBusy(true);
    setMessage(null);
    const result = await attemptUnlock(window.localStorage, pin);
    setPin("");
    setBusy(false);
    if (result.ok) {
      // Hızlı giriş: oturum belirtecini yenile (çevrimdışıysa sessizce atlanır)
      createClient().auth.refreshSession().catch(() => undefined);
      unlockApp();
      return;
    }
    if (result.reason === "LOCKED") {
      setLockedUntil(result.lockedUntil);
      setNow(Date.now());
      setMessage("Çok fazla hatalı deneme. Bekleme süresi dolunca tekrar deneyin.");
    } else if (result.reason === "WRONG") {
      if (result.lockedUntil) {
        setLockedUntil(result.lockedUntil);
        setNow(Date.now());
        setMessage("5 hatalı deneme: geçici olarak kilitlendi.");
      } else {
        setMessage(`PIN hatalı. Kalan deneme: ${result.remainingAttempts}`);
      }
    } else {
      unlockApp();
    }
  }

  async function forgot() {
    if (!window.confirm("PIN kaldırılacak ve oturum kapatılacak. Şifrenizle yeniden giriş yapmanız gerekir. Devam edilsin mi?")) return;
    removePin(window.localStorage);
    await createClient().auth.signOut().catch(() => undefined);
    window.location.replace("/login");
  }

  return (
    <main className="container" style={{ maxWidth: 380, paddingTop: 64 }}>
      <form className="card stack stack-md" onSubmit={submit}>
        <h1>PIN girin</h1>
        <p>Uygulama kilitli. Devam etmek için cihaz PIN kodunuzu girin.</p>
        <div className="form-group">
          <label className="form-label" htmlFor="pin-input">PIN</label>
          <input
            id="pin-input"
            className="form-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={MAX_PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            disabled={busy || waitSeconds > 0}
            autoFocus
          />
        </div>
        {waitSeconds > 0 ? <div className="alert alert-warning" role="status">Lütfen {waitSeconds} sn bekleyin.</div> : null}
        {message ? <div className="alert alert-error" role="alert">{message}</div> : null}
        <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy || waitSeconds > 0 || pin.length === 0}>
          Kilidi aç
        </button>
        <button type="button" className="btn btn-ghost btn-full" onClick={() => void forgot()}>PIN&apos;imi unuttum</button>
      </form>
    </main>
  );
}
