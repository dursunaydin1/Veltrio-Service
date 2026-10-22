-- ============================================================
-- Migration: 017_sale_fields.sql
-- FAZ 4 / ADIM 4.1-4.2 — Satış alanları (K-008, K-027)
-- ============================================================

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS notes         TEXT,
  ADD COLUMN IF NOT EXISTS finalized_at  TIMESTAMPTZ;

COMMENT ON COLUMN sales.finalized_at IS 'Satışın kesinleştiği an (stok çıkışı ve tahsilat bu anda yapılır)';
