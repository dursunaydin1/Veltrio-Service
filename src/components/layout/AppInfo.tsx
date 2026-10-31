"use client";

import { useSessionStore } from "@/stores/session";

/** Menü'nün en altındaki küçük satır (K-069): sürüm ve cihaz kodu; destek isterken elde olsun diye. */
export function AppInfo({ version }: { version: string }) {
  const deviceCode = useSessionStore((s) => s.device?.device_code);
  return (
    <p className="app-info">
      Veltrio Service v{version}
      {deviceCode ? ` · ${deviceCode}` : null}
    </p>
  );
}
