import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Ayarlar" };

export default function Page() {
  return (
    <section className="stack stack-md">
      <PageHead title="Ayarlar" />
      <ul className="menu-list" aria-label="Ayarlar">
        <li><Link href="/settings/business">İşletme bilgileri ve ayarlar (onay eşiği, hatırlatma, stok…)</Link></li>
        <li><Link href="/settings/staff">Çalışanlar (davet ve izinler)</Link></li>
        <li><Link href="/settings/catalog">Arıza ve işlem katalogları</Link></li>
        <li><Link href="/settings/templates">Servis şablonları (kontrol listesi)</Link></li>
        <li><Link href="/settings/appearance">Görünüm (koyu / açık tema)</Link></li>
        <li><Link href="/settings/pin">Cihaz PIN kodu</Link></li>
        <li><Link href="/settings/devices">Cihazlar (liste ve iptal)</Link></li>
        <li><Link href="/settings/backup">Yedekleme ve geri yükleme</Link></li>
        <li><Link href="/settings/history">Geçmiş (kritik işlem kayıtları)</Link></li>
        <li><Link href="/settings/data-check">Veri denetimi (stok özeti)</Link></li>
      </ul>
    </section>
  );
}
