-- ============================================================
-- Migration: 008_product_catalog_fields.sql
-- FAZ 2 / ADIM 2.1 — Ürün kataloğu alanları (K-008: tam zamanında şema)
-- Fotoğraf (photo_ref) fotoğraf altyapısı kurulduğunda eklenecek.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brand                  TEXT,
  ADD COLUMN IF NOT EXISTS model                  TEXT,
  ADD COLUMN IF NOT EXISTS compatible_models_note TEXT,
  ADD COLUMN IF NOT EXISTS storage_location       TEXT;
