import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Raporlar" };

export default function Page() {
  return (
    <section className="stack stack-md">
      <h1>Raporlar</h1>
      <ul className="menu-list" aria-label="Raporlar">
        <li>
          <Link href="/reports/balances">Bakiyeler ve yaşlandırma (müşteri / tedarikçi)</Link>
        </li>
      </ul>
      <div className="alert alert-warning" role="note">
        Satış, stok, kâr ve diğer raporlar FAZ 6 kapsamında geliştirilecek.
      </div>
    </section>
  );
}
