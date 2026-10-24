"use client";

import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { BottomNav } from "@/components/layout/BottomNav";
import { DeviceSetup } from "@/components/layout/DeviceSetup";
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
  const businessName = useSessionStore((s) => s.business?.name);
  const sessionLoaded = useSessionStore((s) => s.sessionLoaded);
  const hasUser = useSessionStore((s) => !!s.user);
  const hasDevice = useSessionStore((s) => !!s.device);
  const needsSetup = useSessionStore((s) => s.needsSetup);

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
      <header className="app-header">
        <span className="app-title">{businessName ?? "Veltrio Servis"}</span>
        <div className="app-header-actions">
          <SyncStatus />
          <NotificationBell />
          <Link href="/search" className="icon-btn" aria-label="Ara">
            <Search size={22} aria-hidden="true" />
          </Link>
          <Link href="/more" className="icon-btn" aria-label="Menü">
            <Menu size={22} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <main id="main" className="app-main">
        {children}
      </main>
      <BottomNav />
    </div>
    </PinGate>
  );
}
