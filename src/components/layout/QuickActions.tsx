import Link from "next/link";
import { ScanLine, Search } from "lucide-react";

/**
 * Ana ekran üst bölümü: büyük arama kutusu (QR ile) — PRD §4.7.
 * Yeni kayıt (servis, satış…) her sayfada aynı yerden, alttaki logolu düğmeden açılır (K-050).
 */
export function QuickActions() {
  return (
    <div className="search-pill">
      <Link href="/search" className="search-pill-input">
        <Search size={20} aria-hidden="true" />
        Müşteri, makine veya ürün ara
      </Link>
      <Link href="/scan" className="search-pill-qr" aria-label="QR tara">
        <ScanLine size={22} aria-hidden="true" />
      </Link>
    </div>
  );
}
