-- ============================================================
-- Migration: 009_stock_ledger.sql
-- FAZ 2 / ADIM 2.3 — Stok hareket defteri (karar günlüğü K-017)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Hareket alanları: kova (satılabilir / hasarlı), ters kayıt bağlantısı,
--    sıfır miktarlı hareket yasak, CANCEL_REVERSAL türü.
--    quantity_before/after bilerek YOK: çevrimdışı iki cihazda yanlış çıkar,
--    bakiye her zaman hareketlerin toplamından hesaplanır.
-- ------------------------------------------------------------
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS bucket TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (bucket IN ('AVAILABLE', 'DAMAGED')),
  ADD COLUMN IF NOT EXISTS reversal_of_id UUID REFERENCES stock_movements(id) ON DELETE SET NULL;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.stock_movements'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%movement_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.stock_movements DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check CHECK (movement_type IN (
    'OPENING', 'PURCHASE_IN', 'SALE_OUT', 'SERVICE_USE',
    'RETURN_IN', 'RETURN_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
    'DAMAGED_IN', 'DAMAGED_DISPOSE', 'TRANSFER', 'CANCEL_REVERSAL'
  )),
  ADD CONSTRAINT stock_movements_quantity_nonzero CHECK (quantity <> 0);

CREATE INDEX IF NOT EXISTS idx_stock_movements_reversal ON stock_movements(reversal_of_id);

-- ------------------------------------------------------------
-- 2) Ürünün stok özeti (stock_available / stock_damaged) hareket eklenince
--    sunucuda güncellenir. İstemci ekranda hareketlerden hesaplanan değeri
--    gösterir; bu sütunlar raporlar ve karşılaştırma içindir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.bucket = 'DAMAGED' THEN
    UPDATE products
    SET stock_damaged = stock_damaged + NEW.quantity
    WHERE id = NEW.product_id AND business_id = NEW.business_id;
  ELSE
    UPDATE products
    SET stock_available = stock_available + NEW.quantity
    WHERE id = NEW.product_id AND business_id = NEW.business_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movements_apply ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_apply
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- ------------------------------------------------------------
-- 3) Yalnızca stok miktarı değişen ürün güncellemesi `version` artırmaz;
--    aksi halde her stok hareketi, o ürünü düzenleyen cihazda sahte çakışma
--    üretirdi (K-017).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_product_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'stock_available' - 'stock_damaged' - 'updated_at' - 'version')
     = (to_jsonb(OLD) - 'stock_available' - 'stock_damaged' - 'updated_at' - 'version') THEN
    NEW.version := OLD.version;
  ELSE
    NEW.version := COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_version ON public.products;
CREATE TRIGGER trg_products_version
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.bump_product_version();
