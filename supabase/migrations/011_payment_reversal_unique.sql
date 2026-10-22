-- ============================================================
-- Migration: 011_payment_reversal_unique.sql
-- FAZ 2 / ADIM 2.7 — Bir ödeme yalnızca bir kez ters kaydedilebilir
-- Ters kayıt: karşı yönlü yeni Payment (status = REVERSED, reversal_of_id = orijinal).
-- Orijinal ödeme güncellenmez (ödemeler yalnızca-ekleme tablosudur).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_reversal_of
  ON payments(reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;
