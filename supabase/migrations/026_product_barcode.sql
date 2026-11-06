-- ============================================================
-- 026 · Ürün fabrika barkodu (K-102)
-- Kutudaki EAN / UPC / Code 128 barkodu ürüne bir kez tanıtılır; sonra okutunca
-- ürün açılır, satışta okutunca satışa eklenir. Aynı işletmede bir barkod tek üründe olur.
-- Eşitleme: products zaten sync_changes tetikleyicisinde (005); yeni sütun satırla birlikte gider.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS barcode TEXT CHECK (barcode IS NULL OR char_length(barcode) BETWEEN 4 AND 64);

CREATE UNIQUE INDEX IF NOT EXISTS products_business_barcode_uidx
  ON products (business_id, barcode)
  WHERE barcode IS NOT NULL;
