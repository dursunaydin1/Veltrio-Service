"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Package, ShoppingBag, ShoppingCart, UserPlus, Wrench } from "lucide-react";

/**
 * Hızlı seçim: tüm "yeni kayıt" işleri tek satırda ikon olarak. En sık iş (Servis aç) ortada, logolu düğmenin üstünde.
 * `short` ikonun altında görünür (telefonda üzerine gelme olmadığından yazı hep görünür); `label` tam addır (ipucu/ekran okuyucu).
 */
const ACTIONS = [
  { href: "/customers/new", short: "Müşteri", label: "Müşteri ekle", Icon: UserPlus, tone: "blue" },
  { href: "/sales/new", short: "Satış", label: "Satış yap", Icon: ShoppingCart, tone: "green" },
  { href: "/services/new", short: "Servis", label: "Servis aç", Icon: Wrench, tone: "accent" },
  { href: "/products/new", short: "Ürün", label: "Ürün ekle", Icon: Package, tone: "violet" },
  { href: "/purchases/new", short: "Satın al", label: "Satın alma", Icon: ShoppingBag, tone: "yellow" },
] as const;
const CENTER = 2;

/** Kısa titreşim (destekleyen Android tarayıcılarında; diğerlerinde sessizce yok sayılır). */
export function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    // desteklenmiyor
  }
}

/**
 * Ortadaki logolu düğmeye basınca hemen üstünde açılan hızlı seçim (K-048, K-049).
 * Dışına dokununca veya Esc ile kapanır.
 */
export function QuickDial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    listRef.current?.querySelectorAll<HTMLElement>("a")[CENTER]?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dial-backdrop" onClick={onClose}>
      <ul ref={listRef} className="dial" role="menu" aria-label="Hızlı işlemler" onClick={(e) => e.stopPropagation()}>
        {ACTIONS.map(({ href, short, label, Icon, tone }, i) => (
          <li key={href} style={{ animationDelay: `${Math.abs(i - CENTER) * 40}ms` }}>
            <Link
              href={href}
              role="menuitem"
              className="dial-item"
              title={label}
              aria-label={label}
              onClick={() => {
                haptic();
                onClose();
              }}
            >
              <span className="avatar" data-tone={tone} aria-hidden="true"><Icon size={22} /></span>
              <span className="dial-label" aria-hidden="true">{short}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
