-- ============================================================
-- Migration: 022_photos.sql
-- FAZ 2-3 — Fotoğraflar (FR-028, K-036)
-- ============================================================

-- İstemcide 1600 px'e küçültülmüş JPEG, data URL metni olarak saklanır.
-- Büyük hacimde Supabase Storage'a taşınması Faz 7'de değerlendirilir.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS photo TEXT;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS photo TEXT;
ALTER TABLE services  ADD COLUMN IF NOT EXISTS intake_photo TEXT;

COMMENT ON COLUMN customers.photo      IS 'İsteğe bağlı müşteri fotoğrafı (JPEG data URL, ≤1600px)';
COMMENT ON COLUMN products.photo       IS 'İsteğe bağlı ürün fotoğrafı (JPEG data URL, ≤1600px)';
COMMENT ON COLUMN services.intake_photo IS 'İsteğe bağlı kabul fotoğrafı (JPEG data URL, ≤1600px)';
