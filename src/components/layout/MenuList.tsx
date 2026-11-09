"use client";

import Link from "next/link";
import {
  ChartColumn,
  CircleHelp,
  Cog,
  DatabaseBackup,
  KeyRound,
  Package,
  Palette,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { canOpenRoute } from "@/lib/auth/permissions";
import { useSessionStore } from "@/stores/session";
import { LogoutItem } from "@/components/layout/LogoutItem";

type MenuItem = { href: string; label: string; Icon: LucideIcon };

/** Menü — PRD §4.7. Telefonda alt menüde olmayan Satışlar ve Stok en üstte (K-044); tek tonlu sade liste (K-053). */
const RECORDS: readonly MenuItem[] = [
  { href: "/sales", label: "Satışlar", Icon: ShoppingCart },
  { href: "/products", label: "Stok", Icon: Package },
  { href: "/machines", label: "Makineler", Icon: Cog },
  { href: "/suppliers", label: "Tedarikçiler", Icon: Truck },
  { href: "/purchases", label: "Satın Almalar", Icon: ShoppingBag },
  { href: "/reports", label: "Raporlar", Icon: ChartColumn },
];

const LINKS: readonly MenuItem[] = [
  { href: "/settings", label: "Ayarlar", Icon: Settings },
  { href: "/settings/backup", label: "Yedekleme", Icon: DatabaseBackup },
  { href: "/help", label: "Yardım", Icon: CircleHelp },
];

/** Ayarlar'a giremeyen çalışan, kendi cihazının ayarlarına buradan ulaşır */
const OWN_DEVICE_LINKS: readonly MenuItem[] = [
  { href: "/settings/appearance", label: "Görünüm", Icon: Palette },
  { href: "/settings/pin", label: "Cihaz PIN kodu", Icon: KeyRound },
];

function Items({ items }: { items: readonly MenuItem[] }) {
  return items.map(({ href, label, Icon }) => (
    <li key={href}>
      <Link href={href}>
        <span className="avatar avatar-sm menu-avatar" aria-hidden="true">
          <Icon size={18} />
        </span>
        {label}
      </Link>
    </li>
  ));
}

/** Kullanıcının açamayacağı bölümler menüde hiç gösterilmez (K-119). */
export function MoreMenu() {
  const user = useSessionStore((s) => s.user);
  const allowed = (items: readonly MenuItem[]) => items.filter(({ href }) => canOpenRoute(user, href));
  const settingsOpen = canOpenRoute(user, "/settings");

  return (
    <>
      <ul className="menu-list" aria-label="Kayıtlar">
        <Items items={allowed(RECORDS)} />
      </ul>
      <ul className="menu-list" aria-label="Uygulama">
        <Items items={settingsOpen ? allowed(LINKS) : [...OWN_DEVICE_LINKS, ...allowed(LINKS)]} />
        <LogoutItem />
      </ul>
    </>
  );
}
