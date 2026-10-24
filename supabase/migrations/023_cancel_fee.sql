-- ============================================================
-- Migration: 023_cancel_fee.sql
-- FAZ 3 / ADIM 3.13 — İptal edilen serviste inceleme / teşhis ücreti (K-037)
-- ============================================================

-- İptal edilen servis normalde müşteriye yazılmaz. İnceleme / teşhis ücreti
-- alınacaksa tutar burada tutulur: servis iptal olarak kalır, sayaç artmaz,
-- ücret müşteri bakiyesine ve servis bakiyesine yazılır.
ALTER TABLE services ADD COLUMN IF NOT EXISTS cancel_fee DECIMAL(15,4) CHECK (cancel_fee >= 0);

COMMENT ON COLUMN services.cancel_fee IS 'İptal edilen serviste alınan inceleme/teşhis ücreti; boşsa ücret yok';
