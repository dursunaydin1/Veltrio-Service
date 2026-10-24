"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { QrLabel } from "@/components/qr/QrLabel";

/** Ürün QR etiketi: ürün adı ve kodu basılır; okutulunca güncel stok/fiyat ürün sayfasında görünür. */
export function ProductQr({ id }: { id: string }) {
  const product = useLiveQuery(() => db.products.get(id), [id]);
  if (product === undefined) return null;
  return (
    <section className="stack stack-md">
      <div className="no-print row row-between">
        <h1>Ürün QR etiketi</h1>
        <Link href={`/products/${id}`} className="btn btn-secondary btn-sm">Ürüne dön</Link>
      </div>
      <QrLabel kind="product" id={id} title={product?.name ?? id.slice(0, 8)} subtitle={product?.code ?? undefined} />
    </section>
  );
}
