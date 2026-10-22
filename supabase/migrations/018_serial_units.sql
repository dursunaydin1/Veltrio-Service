-- ============================================================
-- Migration: 018_serial_units.sql
-- FAZ 2 / ADIM 2.2 + FAZ 4 / ADIM 4.3 — Seri takipli birimler ve makine satışı (K-008, K-028)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Seri birim: iç numara (SB-…), alım / satış kalemi bağlantıları,
--    durum kümesine RETURNED_TO_SUPPLIER eklenir.
-- ------------------------------------------------------------
ALTER TABLE product_serial_units
  ADD COLUMN IF NOT EXISTS internal_number    TEXT,
  ADD COLUMN IF NOT EXISTS purchase_item_id   UUID,
  ADD COLUMN IF NOT EXISTS sale_item_id       UUID;

-- purchase_item_id / sale_item_id bilerek yabancı anahtar DEĞİLDİR: birim → alım satırı →
-- stok hareketi → birim şeklinde döngü oluşur ve eşitleme sırasını (üst kayıt önce) bozar.
-- Bağlantı bilgi amaçlıdır; tutarlılığı uygulama sağlar.

CREATE UNIQUE INDEX IF NOT EXISTS uq_serial_units_internal_number
  ON product_serial_units(business_id, internal_number)
  WHERE internal_number IS NOT NULL;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.product_serial_units'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%IN_STOCK%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.product_serial_units DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

ALTER TABLE product_serial_units
  ADD CONSTRAINT product_serial_units_status_check
  CHECK (status IN ('IN_STOCK', 'SOLD', 'DAMAGED', 'RETURNED', 'RETURNED_TO_SUPPLIER'));

-- ------------------------------------------------------------
-- 2) Alım satırında girilen seri numaraları (taslakta saklanır; teslim
--    alınınca birim kayıtları oluşur).
-- ------------------------------------------------------------
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS serial_numbers JSONB;

-- ------------------------------------------------------------
-- 3) Makine satış bilgisi (makine kartında gösterilir).
-- ------------------------------------------------------------
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS sale_id     UUID,  -- yabancı anahtar değil: makineler satışlardan önce eşitlenir
  ADD COLUMN IF NOT EXISTS sale_date   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sale_price  DECIMAL(15,4);
