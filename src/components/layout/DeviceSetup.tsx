"use client";

import { useState } from "react";
import { useDevice } from "@/hooks/useDevice";
import { suggestDeviceName } from "@/lib/device";

/**
 * "Bu cihazı kaydet" ekranı (FR-002). Cihaz kodu sunucuda atanır; kullanıcı
 * yalnızca tanıyabileceği bir ad verir (ör. "Dükkân telefonu").
 */
export function DeviceSetup() {
  const { registerDevice } = useDevice();
  const [name, setName] = useState(() =>
    typeof navigator === "undefined" ? "" : suggestDeviceName(navigator.userAgent)
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await registerDevice(name.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cihaz kaydedilemedi.");
      setBusy(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: 48 }}>
      <form className="card stack stack-md" onSubmit={handleSubmit}>
        <h1>Bu cihazı kaydet</h1>
        <p>
          Bu tarayıcı henüz kayıtlı değil. Cihaza tanıyabileceğiniz bir ad verin;
          cihaz kodu otomatik atanır.
        </p>

        <div className="form-group">
          <label className="form-label" htmlFor="device-name">
            Cihaz adı
          </label>
          <input
            id="device-name"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            autoComplete="off"
          />
        </div>

        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={busy || name.trim().length === 0}
        >
          {busy ? "Kaydediliyor…" : "Cihazı kaydet"}
        </button>
      </form>
    </main>
  );
}
