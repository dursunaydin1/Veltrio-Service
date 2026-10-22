"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { BottomNav } from "@/components/layout/BottomNav";
import { SyncStatus } from "@/components/layout/SyncStatus";
import { useSessionStore } from "@/stores/session";

/** Giriş yapmış kullanıcının gördüğü sayfa çerçevesi. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const businessName = useSessionStore((s) => s.business?.name);

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        İçeriğe geç
      </a>
      <header className="app-header">
        <span className="app-title">{businessName ?? "Veltrio Servis"}</span>
        <div className="app-header-actions">
          <SyncStatus />
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
  );
}
