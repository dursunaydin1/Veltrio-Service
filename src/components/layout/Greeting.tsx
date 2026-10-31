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
 * Ana sayfanın en üstündeki sade kart (K-056 → K-058): pirinç "BUGÜN" ve iri tarih; sağda logonun soluk silueti.
 * Sayılar ve durum cümlesi yok: açık servis sayısı "Tümü (n)" düğmesinde, gecikme ve yaklaşan teslimler
 * alttaki iş listesinde zaten görünüyor.
 * Tarih İstanbul saatine göredir; sunucu ile tarayıcı saati farklı olabileceği için yalnızca tarayıcıda çizilir.
 */
export function Greeting() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []); // eslint-disable-line react-hooks/set-state-in-effect
  return (
    <section className="home-hero" aria-label="Bugün">
      <span className="home-hero-mark" aria-hidden="true"><LogoGlyph size={84} ring /></span>
      <span className="home-date">Bugün</span>
      <h1 className="home-hello">{now ? DATE_FORMATTER.format(now) : " "}</h1>
    </section>
  );
}
