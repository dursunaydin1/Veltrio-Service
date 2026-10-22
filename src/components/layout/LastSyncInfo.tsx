"use client";

import { useSessionStore } from "@/stores/session";
import { formatDateTime } from "@/lib/utils";

/** Son başarılı eşitleme zamanı (üst çubukta artık yalnızca simge var). */
export function LastSyncInfo() {
  const lastSyncedAt = useSessionStore((s) => s.lastSyncedAt);
  const deviceCode = useSessionStore((s) => s.device?.device_code);

  return (
    <p>
      Son eşitleme: {lastSyncedAt ? formatDateTime(lastSyncedAt) : "henüz yapılmadı"}
      {deviceCode ? ` · Cihaz: ${deviceCode}` : null}
    </p>
  );
}
