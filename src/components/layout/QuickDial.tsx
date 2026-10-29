"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { LayoutGrid, ShoppingCart, UserPlus, Wrench } from "lucide-react";

/** Hızlı seçim: en sık üç iş + "Diğer" (tam listeyi açar). Liste yukarıdan aşağı dizilir; en sık iş (Servis aç) en altta, başparmağa en yakın. */
const ACTIONS = [
  { href: "/customers/new", label: "Müşteri ekle", Icon: UserPlus, tone: "blue" },
  { href: "/sales/new", label: "Satış yap", Icon: ShoppingCart, tone: "green" },
  { href: "/services/new", label: "Servis aç", Icon: Wrench, tone: "accent" },
] as const;

/** Kısa titreşim (destekleyen Android tarayıcılarında; diğerlerinde sessizce yok sayılır). */
export function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    // desteklenmiyor
  }
}

/**
 * Ortadaki logolu düğmeye basınca hemen üstünde açılan hızlı seçim (K-048).
 * Dışına dokununca veya Esc ile kapanır; "Diğer" tam listeyi (ürün, satın alma…) açar.
 */
export function QuickDial({ open, onClose, onMore }: { open: boolean; onClose: () => void; onMore: () => void }) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    listRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dial-backdrop" onClick={onClose}>
      <ul ref={listRef} className="dial" role="menu" aria-label="Hızlı işlemler" onClick={(e) => e.stopPropagation()}>
        <li style={{ animationDelay: "120ms" }}>
          <button
            type="button"
            role="menuitem"
            className="dial-item"
            onClick={() => {
              haptic();
              onMore();
            }}
          >
            <span className="dial-label">Diğer</span>
            <span className="avatar" data-tone="gray" aria-hidden="true"><LayoutGrid size={20} /></span>
          </button>
        </li>
        {ACTIONS.map(({ href, label, Icon, tone }, i) => (
          <li key={href} style={{ animationDelay: `${80 - i * 40}ms` }}>
            <Link
              href={href}
              role="menuitem"
              className="dial-item"
              onClick={() => {
                haptic();
                onClose();
              }}
            >
              <span className="dial-label">{label}</span>
              <span className="avatar" data-tone={tone} aria-hidden="true"><Icon size={20} /></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
