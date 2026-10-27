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

/** Üst çubukta işletme adının altındaki küçük satır: selam ve bugünün tarihi (İstanbul saati). */
export function Greeting() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []); // eslint-disable-line react-hooks/set-state-in-effect
  if (!now) return null;
  return (
    <span className="app-subtitle">
      {greetingFor(Number(HOUR_FORMATTER.format(now)))} · {DATE_FORMATTER.format(now)}
    </span>
  );
}
