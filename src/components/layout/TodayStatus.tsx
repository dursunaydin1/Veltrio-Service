"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { AlarmClock, CalendarClock, CircleDollarSign, ClipboardCheck, PackageOpen, PackageX, type LucideIcon } from "lucide-react";
import { db } from "@/lib/db";
import { isLow, loadStockFacts } from "@/lib/notifications/stockAlerts";
import { loadServiceFacts, summarizeServices } from "@/lib/notifications/serviceReminders";
import { useSessionStore } from "@/stores/session";
import { todayLocalDate } from "@/lib/utils";

/**
 * "Bugün yapılacaklar" — işletmeyle ilgili canlı sayılar (yerel veritabanından) cümle olarak:
 * teslimi geçen / yaklaşan, onay / parça bekleyen servis (Adım 3.17), kritik stok, vadesi gelen alacak.
 * Yalnızca sıfırdan büyük olanlar gösterilir; hiçbiri yoksa bölüm hiç görünmez.
 * Eşitleme bilgisi burada değil, üst çubuktadır (K-013).
 */
export function TodayStatus() {
  const businessId = useSessionStore((s) => s.business?.id);
  const reminderDays = useSessionStore((s) => s.business?.settings?.default_service_reminder_days);

  const summary = useLiveQuery(
    async () => (businessId ? summarizeServices(await loadServiceFacts(businessId), todayLocalDate(), reminderDays) : undefined),
    [businessId, reminderDays]
  );
  const criticalStock = useLiveQuery(
    async () => (businessId ? (await loadStockFacts(businessId)).filter(isLow).length : 0),
    [businessId],
    0
  );
  const dueReminders = useLiveQuery(
    () =>
      businessId
        ? db.notifications
            .where("business_id")
            .equals(businessId)
            .filter((n) => n.type === "PAYMENT_DUE" && !n.resolved_at)
            .count()
        : 0,
    [businessId],
    0
  );

  if (summary === undefined) return null;

  const tasks: { count: number; title: string; hint: string; href: string; Icon: LucideIcon; tone: "danger" | "warn" | "accent" }[] = [
    { count: summary.overdue, title: "servisin teslim tarihi geçti", hint: "Müşteriyi arayıp bilgi verin", href: "/services", Icon: AlarmClock, tone: "danger" },
    { count: summary.upcoming, title: "servisin teslimi yaklaştı", hint: "Hazır olup olmadığına bakın", href: "/services", Icon: CalendarClock, tone: "warn" },
    { count: summary.waitingApproval, title: "servis müşteri onayı bekliyor", hint: "Fiyatı müşteriye iletin", href: "/services", Icon: ClipboardCheck, tone: "warn" },
    { count: summary.waitingParts, title: "servis parça bekliyor", hint: "Siparişleri kontrol edin", href: "/services", Icon: PackageOpen, tone: "accent" },
    { count: criticalStock, title: "üründe stok azaldı", hint: "Sipariş vermeyi düşünün", href: "/products", Icon: PackageX, tone: "warn" },
    { count: dueReminders, title: "alacağın vadesi geldi", hint: "Tahsilat için müşteriyi arayın", href: "/reports/balances", Icon: CircleDollarSign, tone: "danger" },
  ];
  const visible = tasks.filter((t) => t.count > 0);

  // Yapılacak iş yokken bölüm hiç gösterilmez (ana ekran sade kalsın)
  if (visible.length === 0) return null;

  return (
    <section className="stack stack-sm" aria-labelledby="today-title">
      <h2 id="today-title" className="section-title">Bugün yapılacaklar</h2>
      <ul className="card-list" aria-label="Bugün yapılacaklar">
        {visible.map(({ count, title, hint, href, Icon, tone }) => (
          <li key={title}>
            <Link href={href} className="item-card">
              <span className="avatar" data-tone={tone} aria-hidden="true">
                <Icon size={20} />
              </span>
              <span className="item-main">
                <span className="item-title">
                  <span className="count" data-tone={tone}>{count}</span> {title}
                </span>
                <span className="item-sub">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
