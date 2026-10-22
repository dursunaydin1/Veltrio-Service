-- ============================================================
-- Migration: 016_purchase_fields.sql
-- FAZ 4 / ADIM 4.6 — Satın alma alanları (K-008, K-026)
-- ============================================================

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS supplier_ref   TEXT,
  ADD COLUMN IF NOT EXISTS received_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason  TEXT;

COMMENT ON COLUMN purchases.supplier_ref IS 'Tedarikçinin fatura / irsaliye numarası (bilgi amaçlı)';
COMMENT ON COLUMN purchases.received_at IS 'Teslim alındığı an (stok girişi bu anda yapılır)';
COMMENT ON COLUMN purchases.cancel_reason IS 'Taslak alımın iptal nedeni';
