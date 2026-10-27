"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LayoutGrid, Plus, Users, Wrench } from "lucide-react";
import { CreateSheet } from "@/components/layout/CreateSheet";

/**
 * Dört sekme + ortada "+" (yeni kayıt paneli) — K-044. Her ekran boyutunda aynıdır.
 * Satışlar ve Stok "Menü" ile + panelinden erişilir.
 */
const MOBILE_LEFT = [
  { href: "/dashboard", label: "Ana Sayfa", Icon: House },
  { href: "/services", label: "Servisler", Icon: Wrench },
] as const;
const MOBILE_RIGHT = [
  { href: "/customers", label: "Müşteriler", Icon: Users },
  { href: "/more", label: "Menü", Icon: LayoutGrid },
] as const;

type Item = { href: string; label: string; Icon: typeof House };

export function BottomNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const tab = ({ href, label, Icon }: Item) => (
    <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}>
      <span className="nav-icon">
        <Icon size={22} strokeWidth={isActive(href) ? 2.4 : 2} aria-hidden="true" />
      </span>
      {label}
    </Link>
  );

  return (
    <>
      <nav className="bottom-nav" aria-label="Ana gezinme">
        <div className="nav-mobile">
          {MOBILE_LEFT.map(tab)}
          <button type="button" className="nav-fab" aria-label="Yeni kayıt ekle" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
            <Plus size={28} strokeWidth={2.6} aria-hidden="true" />
          </button>
          {MOBILE_RIGHT.map(tab)}
        </div>
      </nav>
      <CreateSheet open={sheetOpen} onClose={closeSheet} />
    </>
  );
}
