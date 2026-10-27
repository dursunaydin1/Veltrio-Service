import Link from "next/link";
import { ScanLine, Search, ShoppingCart, Wrench } from "lucide-react";

/**
 * Ana ekran hızlı eylemleri — PRD §4.7. En sık iş (servis açma) öne çıkarılır.
 */
const ACTIONS = [
  { href: "/services/new", label: "Yeni Servis", hint: "Makine kabulü", Icon: Wrench, primary: true },
  { href: "/sales/new", label: "Yeni Satış", hint: "Peşin veya veresiye", Icon: ShoppingCart },
  { href: "/search", label: "Ara", hint: "Müşteri, makine, ürün", Icon: Search },
  { href: "/scan", label: "QR Tara", hint: "Etiketi okut", Icon: ScanLine },
] as const;

export function QuickActions() {
  return (
    <div className="quick-grid">
      {ACTIONS.map(({ href, label, hint, Icon, ...rest }) => (
        <Link key={href} href={href} className={`quick-action${"primary" in rest ? " quick-action-primary" : ""}`}>
          <span className="qa-icon">
            <Icon size={22} aria-hidden="true" />
          </span>
          <span className="qa-text">
            {label}
            <small>{hint}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}
