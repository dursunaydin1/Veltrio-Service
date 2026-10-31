"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { LogoGlyph } from "@/components/layout/Logo";
import { loadServiceFacts, summarizeServices } from "@/lib/notifications/serviceReminders";
import { todayLocalDate } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";

/** "31 Ekim Cumartesi" (İstanbul saati) */
const DATE_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  weekday: "long",
  timeZone: "Europe/Istanbul",
});

type DaySummary = { active: number; upcoming: number; overdue: number; waitingApproval: number };

/** Kartın başlığı altındaki tek cümle: günün durumuna göre ne yapılması gerektiğini söyler (K-057). */
export function dayNote(s: DaySummary | undefined): string {
  if (!s) return "Kayıtlar yükleniyor…";
  if (s.overdue > 0) return "Gecikmiş servislere öncelik verin.";
  if (s.waitingApproval > 0) return "Müşteri onayı bekleyen servisler var.";
  if (s.upcoming > 0) return "Yaklaşan teslimleri kontrol edin.";
  if (s.active > 0) return "Her şey yolunda, gecikme yok.";
  return "Atölye boş, yeni işlere hazır.";
}


/**
 * Ana sayfanın günün özeti kartı (K-056, K-057): pirinç "GÜNÜN ÖZETİ", iri tarih, günün durumunu söyleyen
 * tek cümle ve üç sayı (açık servis, teslimi yaklaşan, gecikmiş). Sağda logonun soluk silueti markayı taşır.
 * Saat ve tarih İstanbul saatine göredir; sunucu ile tarayıcı saati farklı olabileceği için yalnızca tarayıcıda çizilir.
 */
export function Greeting() {
  const businessId = useSessionStore((s) => s.business?.id);
  const reminderDays = useSessionStore((s) => s.business?.settings?.default_service_reminder_days);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []); // eslint-disable-line react-hooks/set-state-in-effect
  const summary = useLiveQuery(
    async () => (businessId ? summarizeServices(await loadServiceFacts(businessId), todayLocalDate(), reminderDays) : undefined),
    [businessId, reminderDays]
  );

  return (
    <section className="home-hero" aria-label="Günün özeti">
      <span className="home-hero-mark" aria-hidden="true"><LogoGlyph size={112} ring /></span>
      <span className="home-date">Günün özeti</span>
      <h1 className="home-hello">{now ? DATE_FORMATTER.format(now) : " "}</h1>
      <span className="home-business">{dayNote(summary)}</span>
      <Link href="/services" className="home-stats" aria-label="Servislere git">
        <span><b>{summary?.active ?? "–"}</b>açık servis</span>
        <span><b>{summary?.upcoming ?? "–"}</b>teslimi yaklaşan</span>
        <span data-late={summary && summary.overdue > 0 ? "" : undefined}><b>{summary?.overdue ?? "–"}</b>gecikmiş</span>
      </Link>
    </section>
  );
}
