import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Ayarlar" };

export default function Page() {
  return (
    <section className="stack stack-md">
      <h1>Ayarlar</h1>
      <ul className="menu-list" aria-label="Ayarlar">
        <li><Link href="/settings/catalog">Arıza ve işlem katalogları</Link></li>
        <li><Link href="/settings/templates">Servis şablonları (kontrol listesi)</Link></li>
        <li><Link href="/settings/data-check">Veri denetimi (stok özeti)</Link></li>
      </ul>
    </section>
  );
}
