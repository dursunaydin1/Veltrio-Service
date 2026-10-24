import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Raporlar" };

const GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Satış ve gelir",
    links: [
      { href: "/reports/sales", label: "Satış raporu (günlük / aylık)" },
      { href: "/reports/collections", label: "Tahsilat raporu (yönteme göre)" },
      { href: "/reports/service-revenue", label: "Servis geliri raporu" },
    ],
  },
  {
    title: "Servis",
    links: [
      { href: "/reports/active-services", label: "Aktif servisler" },
      { href: "/reports/machines", label: "Makine geçmişi" },
    ],
  },
  {
    title: "Stok ve bakiye",
    links: [
      { href: "/reports/stock", label: "Stok raporu ve hareket geçmişi" },
      { href: "/reports/balances", label: "Müşteri / tedarikçi bakiyeleri ve yaşlandırma" },
      { href: "/reports/statement", label: "Müşteri hesap ekstresi" },
    ],
  },
  { title: "Veri", links: [{ href: "/reports/export", label: "Excel / CSV olarak dışa aktar" }, { href: "/reports/import", label: "Excel / CSV içe aktar" }] },
];

export default function Page() {
  return (
    <section className="stack stack-md">
      <h1>Raporlar</h1>
      {GROUPS.map((g) => (
        <section key={g.title} className="stack stack-sm" aria-label={g.title}>
          <h2>{g.title}</h2>
          <ul className="menu-list">
            {g.links.map((l) => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}
          </ul>
        </section>
      ))}
    </section>
  );
}
