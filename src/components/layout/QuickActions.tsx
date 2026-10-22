import Link from "next/link";
import { ScanLine, Search, ShoppingCart, Wrench } from "lucide-react";

/**
 * Ana ekran hızlı eylemleri — PRD §4.7.
 * Hedef ekranlar yazıldıkça `href` gerçek akışlara çevrilir; Ara ve QR Tara
 * henüz yok, bu yüzden devre dışı gösterilir.
 */
export function QuickActions() {
  return (
    <div className="quick-grid">
      <Link href="/services" className="quick-action">
        <Wrench size={28} aria-hidden="true" />
        Yeni Servis
      </Link>
      <Link href="/sales" className="quick-action">
        <ShoppingCart size={28} aria-hidden="true" />
        Yeni Satış
      </Link>
      <span className="quick-action" aria-disabled="true">
        <Search size={28} aria-hidden="true" />
        Ara
        <small>Yakında</small>
      </span>
      <span className="quick-action" aria-disabled="true">
        <ScanLine size={28} aria-hidden="true" />
        QR Tara
        <small>Yakında</small>
      </span>
    </div>
  );
}
