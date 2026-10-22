-- ============================================================
-- Migration: 015_service_delivery.sql
-- FAZ 3 / ADIM 3.12 — Teslim bilgileri (K-008, K-023)
-- ============================================================

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS delivered_to       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_balance   DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS debt_acknowledged  BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN services.delivered_to IS 'Teslim alan kişi (müşteri değilse adı)';
COMMENT ON COLUMN services.delivery_balance IS 'Teslim anındaki kalan servis bakiyesi (> 0 ise borçlu teslim)';
COMMENT ON COLUMN services.debt_acknowledged IS 'Borçlu teslimde müşterinin borcu kabul ettiği (AC-025)';
