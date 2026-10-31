"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { ProductForm } from "@/components/products/ProductForm";
import { SerialUnitsPanel } from "@/components/products/SerialUnitsPanel";
import { ProductPurchases, ProductSales } from "@/components/products/ProductDocuments";
import { StockPanel } from "@/components/products/StockPanel";
import { setProductArchived } from "@/lib/products/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import { unitLabel } from "@/lib/products/constants";

/** Ürün düzenleme sayfasının içeriği: form + pasifleştirme / yeniden etkinleştirme. */
export function ProductEditor({ id }: { id: string }) {
  const router = useRouter();
  const ctx = useBusinessContext();
  const [error, setError] = useState<string | null>(null);

  // Dizi dönmesi, "yükleniyor" (undefined) ile "bulunamadı" ([]) ayrımını sağlar.
  const found = useLiveQuery(() => db.products.where("id").equals(id).toArray(), [id]);
  const balance = useLiveQuery(() => getProductBalance(id), [id]);
  const [tab, setTab] = useState<"stock" | "purchases" | "sales" | "general">("stock");

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

      {product.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.photo} alt="Ürün fotoğrafı" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 8, objectFit: "cover" }} />
      ) : null}

      <div className="tile-grid" aria-label="Ürün özeti">
        <div className="tile">
          <div className="tile-label">Stok</div>
          <div className="tile-value">{formatQuantity(balance?.available ?? 0)} {unitLabel(product.unit)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Satış fiyatı</div>
          <div className="tile-value">{formatCurrency(product.default_sale_price)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Son alış fiyatı</div>
          <div className="tile-value">{product.last_purchase_price != null ? formatCurrency(product.last_purchase_price) : "—"}</div>
        </div>
      </div>
      <Link href={`/products/${product.id}/qr`} className="btn btn-secondary btn-full">QR etiketi göster / yazdır</Link>

      <div role="tablist" aria-label="Ürün bölümleri">
        {([
          ["stock", product.is_serial_tracked ? "Seri birimler" : "Stok ve hareketler"],
          ["purchases", "Alışlar"],
          ["sales", "Satışlar"],
          ["general", "Ürün bilgileri"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "stock" ? (product.is_serial_tracked ? <SerialUnitsPanel product={product} /> : <StockPanel product={product} />) : null}
      {tab === "purchases" ? <ProductPurchases productId={product.id} /> : null}
      {tab === "sales" ? <ProductSales productId={product.id} /> : null}
      {tab === "general" ? (
        <>
          <ProductForm key={`${product.id}:${product.version ?? 0}`} product={product} />

          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

          <button type="button" className={`btn btn-full ${archived ? "btn-secondary" : "btn-danger"}`} onClick={toggleArchived}>
            {archived ? "Yeniden etkinleştir" : "Pasifleştir"}
          </button>
        </>
      ) : null}
    </div>
  );
}
