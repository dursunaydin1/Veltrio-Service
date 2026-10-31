"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "@/stores/session";

/** "31 Ekim Cumartesi" (İstanbul saati) */
const DATE_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  weekday: "long",
  timeZone: "Europe/Istanbul",
});
const HOUR_FORMATTER = new Intl.DateTimeFormat("tr-TR", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Istanbul" });

export function greetingFor(hour: number): string {
  if (hour < 5) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

/** Selamda kullanılacak ad: kullanıcının (yoksa işletme sahibinin) ilk adı; hiçbiri yoksa boş. */
export function firstName(...names: (string | undefined | null)[]): string {
  for (const n of names) {
    const first = n?.trim().split(/\s+/)[0];
    if (first) return first;
  }
  return "";
}

/**
 * Ana sayfada üst çubuğun içindeki selam satırı (K-059 → K-064). Logo, yazı ve zil ile birlikte tek kart olur
 * (AppShell, `data-home`); kartın tam ortasında logonun soluk silueti durur.
 * Solda saate göre selam ve kullanıcının ilk adı ("İyi akşamlar, Dursun"), sağda zilin altında tarih.
 * Saat ve tarih İstanbul saatine göredir; sunucu ile tarayıcı saati farklı olabileceği için yalnızca tarayıcıda çizilir.
 */
export function Greeting() {
  const name = useSessionStore((s) => firstName(s.user?.name, s.business?.owner_name));
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []); // eslint-disable-line react-hooks/set-state-in-effect
  const hello = now ? greetingFor(Number(HOUR_FORMATTER.format(now))) : "Hoş geldiniz";
  return (
    <div className="app-today">
      <span className="home-hello">{name ? `${hello}, ${name}` : hello}</span>
      <span className="home-date">{now ? DATE_FORMATTER.format(now) : " "}</span>
    </div>
  );
}
