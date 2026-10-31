"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { LogoGlyph } from "@/components/layout/Logo";
import { loadServiceFacts, summarizeServices } from "@/lib/notifications/serviceReminders";
import { todayLocalDate } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";

const WEEKDAY = new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "Europe/Istanbul" });
const DAY_MONTH = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });
/** "Cumartesi · 31 Ekim" (Intl'in "31 Ekim Cumartesi" sırası yerine) */
const DATE_FORMATTER = { format: (d: Date) => `${WEEKDAY.format(d)} · ${DAY_MONTH.format(d)}` };
const HOUR_FORMATTER = new Intl.DateTimeFormat("tr-TR", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Istanbul" });

export function greetingFor(hour: number): string {
  if (hour < 5) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

/**
 * Ana sayfanın karşılama kartı (K-055, K-056): pirinç renkli tarih, iri selam, işletme adı ve günün üç sayısı
 * (açık servis, teslimi yaklaşan, gecikmiş). Sağda logonun soluk silueti markayı taşır.
 * Saat ve tarih İstanbul saatine göredir; sunucu ile tarayıcı saati farklı olabileceği için yalnızca tarayıcıda çizilir.
 */
export function Greeting() {
  const businessId = useSessionStore((s) => s.business?.id);
  const businessName = useSessionStore((s) => s.business?.name);
  const reminderDays = useSessionStore((s) => s.business?.settings?.default_service_reminder_days);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []); // eslint-disable-line react-hooks/set-state-in-effect
  const summary = useLiveQuery(
    async () => (businessId ? summarizeServices(await loadServiceFacts(businessId), todayLocalDate(), reminderDays) : undefined),
    [businessId, reminderDays]
  );

  return (
    <section className="home-hero" aria-label="Karşılama">
      <span className="home-hero-mark" aria-hidden="true"><LogoGlyph size={150} ring /></span>
      <span className="home-date">{now ? DATE_FORMATTER.format(now) : " "}</span>
      <h1 className="home-hello">{now ? greetingFor(Number(HOUR_FORMATTER.format(now))) : "Hoş geldiniz"}</h1>
      {businessName ? <span className="home-business">{businessName}</span> : null}
      <Link href="/services" className="home-stats" aria-label="Servislere git">
        <span><b>{summary?.active ?? "–"}</b>açık servis</span>
        <span><b>{summary?.upcoming ?? "–"}</b>teslimi yaklaşan</span>
        <span data-late={summary && summary.overdue > 0 ? "" : undefined}><b>{summary?.overdue ?? "–"}</b>gecikmiş</span>
      </Link>
    </section>
  );
}
