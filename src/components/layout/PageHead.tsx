"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Plus } from "lucide-react";

/** Üst karttaki sayfa başlığı satırının DOM yeri (AppShell sağlar). */
export const PageHeadSlot = createContext<HTMLElement | null>(null);

/**
 * Ekran başlığı (K-066, K-068, K-114): ana sayfadaki selam satırı gibi üst kartın içinde görünür;
 * liste ve detay ekranları aynı yerde başlık taşır. Kart yoksa (ör. testte) yerinde çizilir.
 * - `addHref` + `addLabel`: liste ekranında "ekle" düğmesi
 * - `badge`: durum rozeti (Arşivde, Taslak, Pasif…)
 * - `action`: başlığın yanındaki tek eylem (ör. "Ürüne dön")
 */
export function PageHead({
  title,
  addHref,
  addLabel,
  badge,
  action,
}: {
  title: string;
  addHref?: string;
  addLabel?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const slot = useContext(PageHeadSlot);
  const head = (
    <div className="card-row">
      <h1>{title}</h1>
      {badge ? <span className="card-row-badges">{badge}</span> : null}
      {action}
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
