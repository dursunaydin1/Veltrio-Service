"use client";

import { useEffect, useState } from "react";

const DATE_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Istanbul",
});
const HOUR_FORMATTER = new Intl.DateTimeFormat("tr-TR", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Istanbul" });

export function greetingFor(hour: number): string {
  if (hour < 5) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

/** Ana ekran başlığı: günün saatine göre selam ve bugünün tarihi (İstanbul saati). */
export function Greeting() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []); // eslint-disable-line react-hooks/set-state-in-effect

  return (
    <header className="page-head">
      <h1>{now ? greetingFor(Number(HOUR_FORMATTER.format(now))) : "Ana Sayfa"}</h1>
      <p>{now ? DATE_FORMATTER.format(now) : " "}</p>
    </header>
  );
}
