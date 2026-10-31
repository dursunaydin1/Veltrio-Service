"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Plus } from "lucide-react";

/** Üst karttaki sayfa başlığı satırının DOM yeri (AppShell sağlar). */
export const PageHeadSlot = createContext<HTMLElement | null>(null);

/**
 * Liste ekranının başlığı ve "ekle" düğmesi (K-066): ana sayfadaki selam satırı gibi
 * üst kartın içinde görünür. Kart yoksa (ör. testte) yerinde çizilir.
 */
export function PageHead({ title, addHref, addLabel }: { title: string; addHref?: string; addLabel?: string }) {
  const slot = useContext(PageHeadSlot);
  const head = (
    <div className="page-head">
      <h1>{title}</h1>
      {addHref && addLabel ? (
        <Link href={addHref} className="btn-add">
          <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
          {addLabel}
        </Link>
      ) : null}
    </div>
  );
  return slot ? createPortal(head, slot) : head;
}
