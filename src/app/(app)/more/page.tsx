import type { Metadata } from "next";
import Link from "next/link";
import {
  ChartColumn,
  CircleHelp,
  Cog,
  DatabaseBackup,
  LogOut,
  Package,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import { LastSyncInfo } from "@/components/layout/LastSyncInfo";

export const metadata: Metadata = { title: "Menü" };

/** Menü — PRD §4.7. Telefonda alt menüde olmayan Satışlar ve Stok en üstte (K-044); tek tonlu sade liste (K-053). */
const RECORDS = [
  { href: "/sales", label: "Satışlar", Icon: ShoppingCart },
  { href: "/products", label: "Stok", Icon: Package },
  { href: "/machines", label: "Makineler", Icon: Cog },
  { href: "/suppliers", label: "Tedarikçiler", Icon: Truck },
  { href: "/purchases", label: "Satın Almalar", Icon: ShoppingBag },
  { href: "/reports", label: "Raporlar", Icon: ChartColumn },
] as const;

const LINKS = [
  { href: "/settings", label: "Ayarlar", Icon: Settings },
  { href: "/settings/backup", label: "Yedekleme", Icon: DatabaseBackup },
  { href: "/help", label: "Yardım", Icon: CircleHelp },
] as const;

export default function MorePage() {
  return (
    <section className="stack stack-lg">
      <header className="page-head">
        <h1>Menü</h1>
        <LastSyncInfo />
      </header>

      <ul className="menu-list" aria-label="Kayıtlar">
        {RECORDS.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link href={href}>
              <span className="avatar avatar-sm menu-avatar" aria-hidden="true">
                <Icon size={18} />
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>

      <ul className="menu-list" aria-label="Uygulama">
        {LINKS.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link href={href}>
              <span className="avatar avatar-sm menu-avatar" aria-hidden="true">
                <Icon size={18} />
              </span>
              {label}
            </Link>
          </li>
        ))}
        <li>
          <form action={logoutAction}>
            <button type="submit" style={{ color: "var(--danger-fg)" }}>
              <span className="avatar avatar-sm menu-avatar" aria-hidden="true">
                <LogOut size={18} />
              </span>
              Çıkış yap
            </button>
          </form>
        </li>
      </ul>

    </section>
  );
}
