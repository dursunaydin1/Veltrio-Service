"use client";

import { useEffect, useState } from "react";
import { LogoGlyph } from "@/components/layout/Logo";

/** "31 Ekim Cumartesi" (İstanbul saati) */
const DATE_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  weekday: "long",
  timeZone: "Europe/Istanbul",
});

/**
 * Ana sayfada üst çubuğun içindeki tarih satırı (K-059): pirinç "BUGÜN", iri tarih ve köşede logonun soluk silueti.
 * Logo, yazı ve zil ile birlikte tek kart olur (AppShell, `data-home`).
 * Tarih İstanbul saatine göredir; sunucu ile tarayıcı saati farklı olabileceği için yalnızca tarayıcıda çizilir.
 */
export function Greeting() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []); // eslint-disable-line react-hooks/set-state-in-effect
  return (
    <div className="app-today">
      <span className="home-hero-mark" aria-hidden="true"><LogoGlyph size={64} ring /></span>
      <span className="home-date">Bugün</span>
      <span className="home-hello">{now ? DATE_FORMATTER.format(now) : " "}</span>
    </div>
  );
}
