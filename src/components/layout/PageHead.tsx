"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Plus } from "lucide-react";

/** Üst karttaki sayfa başlığı satırının DOM yeri (AppShell sağlar). */
export const PageHeadSlot = createContext<HTMLElement | null>(null);

/**
 * Ekran başlığı ve isteğe bağlı "ekle" düğmesi (K-066, K-068): ana sayfadaki selam satırı gibi
 * üst kartın içinde görünür. Kart yoksa (ör. testte) yerinde çizilir.
 */
export function PageHead({ title, addHref, addLabel }: { title: string; addHref?: string; addLabel?: string }) {
  const slot = useContext(PageHeadSlot);
  const head = (
    <div className="card-row">
      <h1>{title}</h1>
      {addHref && addLabel ? (
        <Link href={addHref} className="btn-add">
          <span className="btn-add-plus" aria-hidden="true"><Plus size={16} strokeWidth={2.75} /></span>
          {addLabel}
        </Link>
      ) : null}
    </div>
  );
  if (!slot) return head;
  // Yazdırırken üst kart gizlenir; başlık sayfada kalsın (raporlar)
  return (
    <>
      {createPortal(head, slot)}
      <p className="print-title" aria-hidden="true">{title}</p>
    </>
  );
}
