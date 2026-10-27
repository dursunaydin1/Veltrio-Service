"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Package, ShoppingBag, ShoppingCart, UserPlus, Wrench, X } from "lucide-react";

/** "+" düğmesinin açtığı eylemler (sade liste; QR tarama ana sayfadaki arama satırındadır). */
const ACTIONS = [
  { href: "/services/new", label: "Servis aç", Icon: Wrench, tone: "accent" },
  { href: "/sales/new", label: "Satış yap", Icon: ShoppingCart, tone: "green" },
  { href: "/customers/new", label: "Müşteri ekle", Icon: UserPlus, tone: "blue" },
  { href: "/products/new", label: "Ürün ekle", Icon: Package, tone: "violet" },
  { href: "/purchases/new", label: "Satın alma", Icon: ShoppingBag, tone: "yellow" },
] as const;

/** Alttan açılan eylem paneli (mobil). Dışına dokununca veya Esc ile kapanır. */
export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Yeni kayıt"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="row row-between">
          <h2>Yeni kayıt</h2>
          <button type="button" className="icon-btn" aria-label="Kapat" onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <ul className="sheet-list">
          {ACTIONS.map(({ href, label, Icon, tone }) => (
            <li key={href}>
              <Link href={href} onClick={onClose}>
                <span className="avatar avatar-sm" data-tone={tone} aria-hidden="true">
                  <Icon size={20} />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
