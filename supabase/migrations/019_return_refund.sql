-- ============================================================
-- Migration: 019_return_refund.sql
-- FAZ 5 / ADIM 5.5 — Müşteri iadesi: para iadesi ödemesinin bağlantısı
-- ============================================================

-- İade nedeniyle yapılan para iadesi (Payment, direction = OUT). Yabancı anahtar
-- değildir: ödemeler ve iadeler ayrı sırayla eşitlenir; bağlantı bilgi amaçlıdır.
ALTER TABLE return_transactions
  ADD COLUMN IF NOT EXISTS refund_payment_id UUID,
  ADD COLUMN IF NOT EXISTS reversal_reason  TEXT;

COMMENT ON COLUMN return_transactions.refund_payment_id IS 'Para iadesi ödemesi (yoksa müşteri alacağına yazılmıştır)';
COMMENT ON COLUMN return_transactions.refund_method IS 'CASH | CARD | BANK_TRANSFER | OTHER | CUSTOMER_CREDIT';
