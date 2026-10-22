"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useProductContext } from "@/hooks/useProductContext";
import { ProductForm } from "@/components/products/ProductForm";
import { StockPanel } from "@/components/products/StockPanel";
import { setProductArchived } from "@/lib/products/service";

/** Ürün düzenleme sayfasının içeriği: form + pasifleştirme / yeniden etkinleştirme. */
export function ProductEditor({ id }: { id: string }) {
  const router = useRouter();
  const ctx = useProductContext();
  const [error, setError] = useState<string | null>(null);

  // Dizi dönmesi, "yükleniyor" (undefined) ile "bulunamadı" ([]) ayrımını sağlar.
  const found = useLiveQuery(() => db.products.where("id").equals(id).toArray(), [id]);

  if (found === undefined) return null;
  if (found.length === 0) {
    return (
      <div className="alert alert-warning" role="alert">
        Ürün bulunamadı. Başka bir cihazda silinmiş olabilir.
      </div>
    );
  }
  const product = found[0];
  const archived = !!product.archived_at;

  async function toggleArchived() {
    const question = archived
      ? "Bu ürün yeniden etkinleştirilsin mi?"
      : "Bu ürün pasifleştirilsin mi? Geçmiş kayıtlar korunur; ürün yeni işlemlerde listelenmez.";
    if (!ctx || !window.confirm(question)) return;
    setError(null);
    try {
      await setProductArchived(ctx, product.id, !archived);
      router.push("/products");
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem yapılamadı.");
    }
  }

  return (
    <div className="stack stack-lg">
      <div className="row row-between">
        <h1>{product.name}</h1>
        {archived ? <span className="badge badge-gray">Pasif</span> : null}
      </div>

      <StockPanel product={product} />

      <ProductForm key={`${product.id}:${product.version ?? 0}`} product={product} />

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      <button type="button" className={`btn btn-full ${archived ? "btn-secondary" : "btn-danger"}`} onClick={toggleArchived}>
        {archived ? "Yeniden etkinleştir" : "Pasifleştir"}
      </button>
    </div>
  );
}
