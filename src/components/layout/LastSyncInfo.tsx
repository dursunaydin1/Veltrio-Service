"use client";

import { useSessionStore } from "@/stores/session";
import { formatDateTime } from "@/lib/utils";

/** Menü başındaki bilgi: işletme adı, son başarılı eşitleme zamanı ve cihaz kodu. */
export function LastSyncInfo() {
  const lastSyncedAt = useSessionStore((s) => s.lastSyncedAt);
  const deviceCode = useSessionStore((s) => s.device?.device_code);
  const businessName = useSessionStore((s) => s.business?.name);

  return (
    <p>
      {businessName ? (
        <>
          <strong style={{ color: "var(--text-primary)" }}>{businessName}</strong>
          <br />
        </>
      ) : null}
      Son eşitleme: {lastSyncedAt ? formatDateTime(lastSyncedAt) : "henüz yapılmadı"}
      {deviceCode ? ` · Cihaz: ${deviceCode}` : null}
    </p>
  );
}
