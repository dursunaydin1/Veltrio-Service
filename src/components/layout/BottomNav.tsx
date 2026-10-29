"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { House, LayoutGrid, Users, Wrench, X } from "lucide-react";
import { CreateSheet } from "@/components/layout/CreateSheet";
import { LogoGlyph } from "@/components/layout/Logo";
import { QuickDial, haptic } from "@/components/layout/QuickDial";
import { loadServiceFacts, summarizeServices } from "@/lib/notifications/serviceReminders";
import { todayLocalDate } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";

/**
 * Yüzen alt çubuk (K-048): dört sekme + ortada logolu düğme. Her ekran boyutunda aynıdır.
 * Logolu düğme hızlı seçimi açar (servis, satış, müşteri, diğer); Satışlar ve Stok Menü'dedir.
 * Servisler sekmesinde dikkat isteyen servis sayısı (teslimi geçen + onay bekleyen) rozetle görünür.
 * Açık sekmeye yeniden dokununca sayfanın başına dönülür.
 */
const LEFT = [
  { href: "/dashboard", label: "Ana Sayfa", Icon: House },
  { href: "/services", label: "Servisler", Icon: Wrench },
] as const;
const RIGHT = [
  { href: "/customers", label: "Müşteriler", Icon: Users },
  { href: "/more", label: "Menü", Icon: LayoutGrid },
] as const;

type Item = { href: string; label: string; Icon: typeof House };

export function BottomNav() {
  const pathname = usePathname();
  const businessId = useSessionStore((s) => s.business?.id);
  const reminderDays = useSessionStore((s) => s.business?.settings?.default_service_reminder_days);
  const [dialOpen, setDialOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeDial = useCallback(() => setDialOpen(false), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const openMore = useCallback(() => {
    setDialOpen(false);
    setSheetOpen(true);
  }, []);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const attention = useLiveQuery(
    async () => {
      if (!businessId) return 0;
      const s = summarizeServices(await loadServiceFacts(businessId), todayLocalDate(), reminderDays);
      return s.overdue + s.waitingApproval;
    },
    [businessId, reminderDays],
    0
  );

  const tab = ({ href, label, Icon }: Item) => {
    const active = isActive(href);
    const badge = href === "/services" && attention > 0 ? attention : 0;
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={badge ? `${label} (${badge} servis dikkat istiyor)` : undefined}
        onClick={(e) => {
          haptic();
          // Açık sekmeye yeniden dokunulursa sayfanın başına dön
          if (pathname === href) {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
      >
        <span className="nav-icon">
          <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
          {badge ? <span className="nav-badge" aria-hidden="true">{badge > 9 ? "9+" : badge}</span> : null}
        </span>
        {label}
      </Link>
    );
  };

  return (
    <>
      <QuickDial open={dialOpen} onClose={closeDial} onMore={openMore} />
      <nav className="bottom-nav" aria-label="Ana gezinme">
        <div className="nav-mobile">
          {LEFT.map(tab)}
          <button
            type="button"
            className="nav-fab"
            data-open={dialOpen ? "" : undefined}
            aria-label={dialOpen ? "Hızlı işlemleri kapat" : "Hızlı işlemler"}
            aria-haspopup="menu"
            aria-expanded={dialOpen}
            onClick={() => {
              haptic();
              setDialOpen((o) => !o);
            }}
          >
            <span className="fab-glyph fab-logo"><LogoGlyph size={30} /></span>
            <span className="fab-glyph fab-close"><X size={26} strokeWidth={2.6} aria-hidden="true" /></span>
          </button>
          {RIGHT.map(tab)}
        </div>
      </nav>
      <CreateSheet open={sheetOpen} onClose={closeSheet} />
    </>
  );
}
