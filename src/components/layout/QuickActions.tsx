import Link from "next/link";
import { ScanLine, Search, ShoppingCart, Wrench } from "lucide-react";

/**
 * Ana ekran hızlı eylemleri — PRD §4.7.
 */
export function QuickActions() {
  return (
    <div className="quick-grid">
      <Link href="/services/new" className="quick-action">
        <Wrench size={28} aria-hidden="true" />
        Yeni Servis
      </Link>
      <Link href="/sales/new" className="quick-action">
        <ShoppingCart size={28} aria-hidden="true" />
        Yeni Satış
      </Link>
      <Link href="/search" className="quick-action">
        <Search size={28} aria-hidden="true" />
        Ara
      </Link>
      <Link href="/scan" className="quick-action">
        <ScanLine size={28} aria-hidden="true" />
        QR Tara
      </Link>
    </div>
  );
}
