"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, Cog, House, Menu, Package, Settings, ShoppingBag, ShoppingCart, Truck, Users, Wrench } from "lucide-react";
import { LogoMark } from "@/components/layout/Logo";

/** Alt gezinme — PRD §4.7: Ana Sayfa, Servisler, Satışlar, Stok, Müşteriler */
const ITEMS = [
  { href: "/dashboard", label: "Ana Sayfa", Icon: House },
  { href: "/services", label: "Servisler", Icon: Wrench },
  { href: "/sales", label: "Satışlar", Icon: ShoppingCart },
  { href: "/products", label: "Stok", Icon: Package },
  { href: "/customers", label: "Müşteriler", Icon: Users },
] as const;

/** Yalnızca geniş ekranda (kenar çubuğu) görünen ikincil bağlantılar; mobilde Menü sayfasındadır. */
const EXTRA_ITEMS = [
  { href: "/machines", label: "Makineler", Icon: Cog },
  { href: "/suppliers", label: "Tedarikçiler", Icon: Truck },
  { href: "/purchases", label: "Satın Almalar", Icon: ShoppingBag },
  { href: "/reports", label: "Raporlar", Icon: ChartColumn },
  { href: "/settings", label: "Ayarlar", Icon: Settings },
  { href: "/more", label: "Menü", Icon: Menu },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="bottom-nav" aria-label="Ana gezinme">
      <span className="nav-brand" aria-hidden="true">
        <LogoMark size={30} />
        Veltrio
      </span>
      {ITEMS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}>
          <span className="nav-icon">
            <Icon size={22} strokeWidth={isActive(href) ? 2.4 : 2} aria-hidden="true" />
          </span>
          {label}
        </Link>
      ))}
      <span className="nav-extra nav-sep" aria-hidden="true" />
      {EXTRA_ITEMS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="nav-extra" aria-current={isActive(href) ? "page" : undefined}>
          <span className="nav-icon">
            <Icon size={20} aria-hidden="true" />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
