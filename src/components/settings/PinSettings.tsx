"use client";

import { useState, useSyncExternalStore } from "react";
import { attemptUnlock, hasPin, removePin, setPin, validatePinFormat } from "@/lib/pin/pin";

const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("veltrio:pin-changed", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("veltrio:pin-changed", cb);
  };
};

/** Cihaz PIN kodunu belirleme, güncelleme ve kaldırma (Adım 1.5). PIN yalnızca bu cihaza aittir. */
export function PinSettings() {
  const enabled = useSyncExternalStore(
    subscribeStorage,
    () => hasPin(window.localStorage),
    () => false
  );
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notify = () => window.dispatchEvent(new Event("veltrio:pin-changed"));

  async function verifyCurrent(): Promise<boolean> {
    const result = await attemptUnlock(window.localStorage, current);
    if (result.ok) return true;
    if (result.reason === "LOCKED") setError("Çok fazla hatalı deneme; bir süre bekleyin.");
    else setError("Mevcut PIN hatalı.");
    return false;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    const problem = validatePinFormat(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError("PIN değerleri aynı değil.");
    setBusy(true);
    if (enabled && !(await verifyCurrent())) return setBusy(false);
    await setPin(window.localStorage, next);
    notify();
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(enabled ? "PIN güncellendi." : "PIN belirlendi. Uygulama bir sonraki açılışta PIN isteyecek.");
    setBusy(false);
  }

  async function remove() {
    setError(null);
    setDone(null);
    setBusy(true);
    if (!(await verifyCurrent())) return setBusy(false);
    removePin(window.localStorage);
    notify();
    setCurrent("");
    setDone("PIN kaldırıldı.");
    setBusy(false);
  }

  return (
    <section className="stack stack-md">
      <h1>Cihaz PIN kodu</h1>
      <p>
        PIN, bu cihazda uygulamayı hızlıca açmak içindir (4-8 rakam). 5 hatalı denemede cihaz geçici olarak kilitlenir.
        PIN&apos;i unutursanız şifrenizle yeniden giriş yaparsınız.
      </p>
      <form className="card stack stack-md" onSubmit={save} noValidate>
        <h2>{enabled ? "PIN değiştir" : "PIN belirle"}</h2>
        {enabled ? (
          <div className="form-group">
            <label className="form-label" htmlFor="pin-current">Mevcut PIN</label>
            <input id="pin-current" className="form-input" type="password" inputMode="numeric" maxLength={8} value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))} />
          </div>
        ) : null}
        <div className="form-group">
          <label className="form-label" htmlFor="pin-new">Yeni PIN</label>
          <input id="pin-new" className="form-input" type="password" inputMode="numeric" maxLength={8} value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="pin-confirm">Yeni PIN (tekrar)</label>
          <input id="pin-confirm" className="form-input" type="password" inputMode="numeric" maxLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} />
        </div>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        {done ? <div className="alert alert-success" role="status">{done}</div> : null}
        <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{enabled ? "PIN'i güncelle" : "PIN'i kaydet"}</button>
        {enabled ? (
          <button type="button" className="btn btn-danger btn-full" onClick={() => void remove()} disabled={busy || current.length === 0}>
            PIN&apos;i kaldır (mevcut PIN gerekli)
          </button>
        ) : null}
      </form>
    </section>
  );
}
