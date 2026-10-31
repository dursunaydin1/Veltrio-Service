"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { BottomNav } from "@/components/layout/BottomNav";
import { Greeting } from "@/components/layout/Greeting";
import { LogoGlyph, Wordmark } from "@/components/layout/Logo";
import { DeviceSetup } from "@/components/layout/DeviceSetup";
import { PwaBanner } from "@/components/layout/PwaBanner";
import { UpdateNotice } from "@/components/layout/UpdateNotice";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { PinGate } from "@/components/layout/PinGate";
import { SetupWizard } from "@/components/layout/SetupWizard";
import { SyncStatus } from "@/components/layout/SyncStatus";
import { useSessionStore } from "@/stores/session";

/**
 * Giriş yapmış kullanıcının gördüğü sayfa çerçevesi.
 * Oturum yüklenene kadar bekler; bu tarayıcı kayıtlı bir cihaz değilse
 * uygulama yerine "Bu cihazı kaydet" ekranını gösterir (FR-002).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const sessionLoaded = useSessionStore((s) => s.sessionLoaded);
  const hasUser = useSessionStore((s) => !!s.user);
  const hasDevice = useSessionStore((s) => !!s.device);
  const needsSetup = useSessionStore((s) => s.needsSetup);
  // Ana sayfada: büyük arama kutusu olduğu için üstteki arama simgesi gizlenir; üst çubuk tarihle birlikte tek kart olur (K-059)
  const onHome = usePathname() === "/dashboard";

  if (!sessionLoaded) {
    return (
      <div className="page-loader" role="status" aria-label="Yükleniyor">
        <div className="loader-ring" />
      </div>
    );
  }
  if (needsSetup) return <SetupWizard />;
  if (hasUser && !hasDevice) return <DeviceSetup />;

  return (
    <PinGate>
    <div className="app-shell">
      <a href="#main" className="skip-link">
        İçeriğe geç
      </a>
      <header className="app-header" data-home={onHome ? "" : undefined}>
        {onHome ? (
          <span className="home-hero-mark" aria-hidden="true"><LogoGlyph size={64} ring /></span>
        ) : null}
        <Link href="/dashboard" className="app-brand" aria-label="Ana sayfa">
          <span className="app-logo"><LogoGlyph size={42} ring /></span>
          <Wordmark />
        </Link>
        <div className="app-header-actions">
          <SyncStatus />
          <NotificationBell />
          {onHome ? null : (
            <Link href="/search" className="icon-btn" aria-label="Ara">
              <Search size={22} aria-hidden="true" />
            </Link>
          )}
        </div>
        {onHome ? <Greeting /> : null}
      </header>
      <main id="main" className="app-main">
        <UpdateNotice />
        <PwaBanner />
        {children}
      </main>
      <BottomNav />
    </div>
    </PinGate>
  );
}
