import type { Metadata } from "next";
import Link from "next/link";
import { ChartColumn, Cog, LogOut, Settings, ShoppingBag, Truck } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import { LastSyncInfo } from "@/components/layout/LastSyncInfo";

export const metadata: Metadata = { title: "Menü" };

/** İkincil menü — PRD §4.7 (Yedekleme ve Yardım ilgili fazlarda eklenecek). */
const LINKS = [
  { href: "/machines", label: "Makineler", Icon: Cog },
  { href: "/suppliers", label: "Tedarikçiler", Icon: Truck },
  { href: "/purchases", label: "Satın Almalar", Icon: ShoppingBag },
  { href: "/reports", label: "Raporlar", Icon: ChartColumn },
  { href: "/settings", label: "Ayarlar", Icon: Settings },
] as const;

export default function MorePage() {
  return (
    <section className="stack stack-md">
      <h1>Menü</h1>
      <LastSyncInfo />
      <ul className="menu-list">
        {LINKS.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link href={href}>
              <Icon size={20} aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
        <li>
          <form action={logoutAction}>
            <button type="submit">
              <LogOut size={20} aria-hidden="true" />
              Çıkış yap
            </button>
          </form>
        </li>
      </ul>
    </section>
  );
}
