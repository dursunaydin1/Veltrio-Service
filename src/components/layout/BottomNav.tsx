"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Package, ShoppingCart, Users, Wrench } from "lucide-react";

/** Alt gezinme — PRD §4.7: Ana Sayfa, Servisler, Satışlar, Stok, Müşteriler */
const ITEMS = [
  { href: "/dashboard", label: "Ana Sayfa", Icon: House },
  { href: "/services", label: "Servisler", Icon: Wrench },
  { href: "/sales", label: "Satışlar", Icon: ShoppingCart },
  { href: "/products", label: "Stok", Icon: Package },
  { href: "/customers", label: "Müşteriler", Icon: Users },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Ana gezinme">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <Icon size={22} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
