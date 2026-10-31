"use client";

import { useEffect, useState } from "react";

/** "31 Ekim Cumartesi" (İstanbul saati) */
const DATE_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  weekday: "long",
  timeZone: "Europe/Istanbul",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Istanbul" });

/**
 * Ana sayfada üst çubuğun içindeki tarih satırı (K-059, K-060). Logo, yazı ve zil ile birlikte tek kart olur
 * (AppShell, `data-home`); kartın tam ortasında, alttaki logolu düğmeyle aynı hizada logonun soluk silueti durur.
 * Sağda, zilin altında pirinç saat (K-062): tarihle birlikte saat kadranı gibi okunur, dakika başında güncellenir.
 * Tarih ve saat İstanbul saatine göredir; sunucu ile tarayıcı saati farklı olabileceği için yalnızca tarayıcıda çizilir.
 */
export function Greeting() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    // Dakika başında güncelle, sonra her dakika
    let timer = window.setTimeout(function tick() {
      setNow(new Date());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    }, 60_000 - (Date.now() % 60_000));
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="app-today">
      <span className="home-hello">{now ? DATE_FORMATTER.format(now) : " "}</span>
      <time className="home-clock" dateTime={now?.toISOString()}>{now ? TIME_FORMATTER.format(now) : " "}</time>
    </div>
  );
}
