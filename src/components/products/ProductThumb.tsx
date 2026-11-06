import { Package } from "lucide-react";
import type { Product } from "@/types";

/**
 * Listelerde ürünün küçük fotoğrafı (K-103): benzer ürünler (buji, filtre) arasında doğrusunu
 * gözle seçmek için. Fotoğraf yoksa kutu simgesi; görüntü ekrana gelince yüklenir.
 */
export function ProductThumb({ product, size = 44 }: { product: Pick<Product, "photo">; size?: number }) {
  const style = { width: size, height: size };
  if (product.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.photo} alt="" className="product-thumb" style={style} loading="lazy" decoding="async" />;
  }
  return (
    <span className="product-thumb product-thumb-empty" style={style} aria-hidden="true">
      <Package size={Math.round(size * 0.45)} />
    </span>
  );
}
