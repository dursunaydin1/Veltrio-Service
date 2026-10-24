"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listDevices, revokeDeviceById, isRevoked } from "@/lib/device/devices";
import { writeAuditLog } from "@/lib/sync/audit";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { useSessionStore } from "@/stores/session";
import { formatDateTime } from "@/lib/utils";
import type { Device } from "@/types";

type Row = Device & { wipe_confirmed_at?: string };

/**
 * Cihaz listesi ve iptal (Adım 1.5, FR-023, AC-045). İptal çevrimiçi yapılır; iptal
 * edilen cihaz bir sonraki bağlantısında yerel verisini siler ve yeniden
 * etkinleştirilemez. Kayıp / çalıntı cihaz için kullanılır.
 */
export function DeviceManager() {
  const ctx = useBusinessContext();
  const isOnline = useSessionStore((s) => s.isOnline);
  const currentCode = useSessionStore((s) => s.device?.device_code);
  const [devices, setDevices] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDevices(await listDevices(createClient()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cihazlar yüklenemedi.");
    }
  }, []);

  useEffect(() => {
    // Sayfa açılışında sunucudaki cihaz listesi bir kez yüklenir
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOnline) void load();
  }, [isOnline, load]);

  async function revoke(device: Row) {
    if (!ctx) return;
    setBusy(true);
    setError(null);
    try {
      await revokeDeviceById(createClient(), device.id);
      await writeAuditLog({
        businessId: ctx.businessId,
        entityType: "devices",
        entityId: device.id,
        action: "STATE_CHANGE",
        deviceCode: ctx.deviceCode,
        actorId: ctx.actorId,
        reason: "Cihaz iptal edildi",
        oldValue: { device_code: device.device_code, is_active: true },
        newValue: { is_active: false },
      });
      setConfirming(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cihaz iptal edilemedi.");
    }
    setBusy(false);
  }

  return (
    <section className="stack stack-md">
      <h1>Cihazlar</h1>
      <p>
        Bu hesaba kayıtlı cihazlar. Kayıp veya çalıntı bir cihazı iptal ederseniz internete bağlandığında yerel verisini
        siler ve bir daha eşitleme yapamaz.
      </p>
      {!isOnline ? <div className="alert alert-warning" role="status">Cihaz listesi ve iptal için internet bağlantısı gerekir.</div> : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      {devices === null ? null : (
        <ul className="menu-list" aria-label="Cihazlar">
          {devices.map((d) => {
            const revoked = isRevoked(d);
            const isCurrent = d.device_code === currentCode;
            return (
              <li key={d.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 0", opacity: revoked ? 0.65 : 1 }}>
                <span className="row row-between">
                  <strong>{d.device_name}</strong>
                  <span className="row row-gap-sm">
                    {isCurrent ? <span className="badge badge-green">Bu cihaz</span> : null}
                    {revoked ? <span className="badge badge-red">İptal edildi</span> : <span className="badge badge-gray">Etkin</span>}
                  </span>
                </span>
                <small style={{ color: "var(--text-muted)" }}>
                  {d.device_code} · Son eşitleme: {d.last_synced_at ? formatDateTime(d.last_synced_at) : "—"}
                  {revoked ? ` · ${d.wipe_confirmed_at ? "Yerel veri silindi" : "Cihaz bağlanınca yerel veri silinecek"}` : ""}
                </small>
                {!revoked ? (
                  confirming === d.id ? (
                    <div className="stack stack-sm">
                      <div className="alert alert-warning" role="note">
                        {isCurrent ? "Bu cihazı iptal ederseniz yerel veriler silinir ve oturum kapanır. " : ""}
                        İptal geri alınamaz. Emin misiniz?
                      </div>
                      <div className="row row-gap-md">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(null)} disabled={busy}>Vazgeç</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => void revoke(d)} disabled={busy || !isOnline}>Cihazı iptal et</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setConfirming(d.id)} disabled={!isOnline}>
                      İptal et…
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
