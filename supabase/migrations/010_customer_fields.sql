-- ============================================================
-- Migration: 010_customer_fields.sql
-- FAZ 3 / ADIM 3.1-3.2 — Müşteri alanları (K-008: tam zamanında şema)
-- Müşteri fotoğrafı (optional_photo_ref) fotoğraf altyapısıyla eklenecek.
-- ============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS no_phone_flag BOOLEAN NOT NULL DEFAULT FALSE;
