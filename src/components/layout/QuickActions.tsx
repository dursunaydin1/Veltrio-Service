import Link from "next/link";
import { ScanLine, Search, ShoppingCart, Wrench } from "lucide-react";

/** Ana ekran üst bölümü: büyük arama kutusu (QR ile) ve en sık iki iş — PRD §4.7. */
export function QuickActions() {
  return (
    <div className="stack stack-md">
      <div className="search-pill">
        <Link href="/search" className="search-pill-input">
          <Search size={20} aria-hidden="true" />
          Müşteri, makine veya ürün ara
        </Link>
        <Link href="/scan" className="search-pill-qr" aria-label="QR tara">
          <ScanLine size={22} aria-hidden="true" />
        </Link>
      </div>
      <div className="quick-grid">
        <Link href="/services/new" className="quick-action quick-action-primary">
          <span className="qa-icon"><Wrench size={22} aria-hidden="true" /></span>
          Servis aç
        </Link>
        <Link href="/sales/new" className="quick-action">
          <span className="qa-icon"><ShoppingCart size={22} aria-hidden="true" /></span>
          Satış yap
        </Link>
      </div>
    </div>
  );
}
