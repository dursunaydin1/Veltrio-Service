"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";

/** "31 Ekim Cumartesi" (İstanbul saati) */
const DATE_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  weekday: "long",
  timeZone: "Europe/Istanbul",
});

/**
 * Ana sayfada üst çubuğun içindeki tarih satırı (K-059, K-060). Logo, yazı ve zil ile birlikte tek kart olur
 * (AppShell, `data-home`); kartın tam ortasında, alttaki logolu düğmeyle aynı hizada logonun soluk silueti durur.
 * Tarih İstanbul saatine göredir; sunucu ile tarayıcı saati farklı olabileceği için yalnızca tarayıcıda çizilir.
 */
export function Greeting() {
  const isOnline = useSessionStore((s) => s.isOnline);
  const lastSyncedAt = useSessionStore((s) => s.lastSyncedAt);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []); // eslint-disable-line react-hooks/set-state-in-effect
  return (
    <div className="app-today">
      <span className="home-hello">{now ? DATE_FORMATTER.format(now) : " "}</span>
      <span className="home-sync" data-offline={isOnline ? undefined : ""}>
        {!isOnline ? "Çevrimdışı" : lastSyncedAt ? `Eşitlendi · ${formatTime(lastSyncedAt)}` : "Eşitleniyor…"}
      </span>
    </div>
  );
}
