-- ============================================================
-- Migration: 013_service_intake_status.sql
-- FAZ 3 / ADIM 3.6-3.7 — Servis kabulü ve durum kümesi (K-008, K-021)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Durum kümesi PRD §6.1'e uyarlanır:
--    RECEIVED → (WAITING_DIAGNOSIS) → DIAGNOSED → (WAITING_CUSTOMER_APPROVAL)
--    → IN_PROGRESS ⇄ WAITING_PARTS → COMPLETED → DELIVERED, CANCELLED
--    Eski READY_FOR_DELIVERY, COMPLETED'a eşlenir.
-- ------------------------------------------------------------
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.services'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%READY_FOR_DELIVERY%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.services DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

UPDATE services SET status = 'COMPLETED' WHERE status = 'READY_FOR_DELIVERY';

ALTER TABLE services ALTER COLUMN status SET DEFAULT 'RECEIVED';

ALTER TABLE services
  ADD CONSTRAINT services_status_check CHECK (status IN (
    'RECEIVED', 'WAITING_DIAGNOSIS', 'DIAGNOSED', 'WAITING_CUSTOMER_APPROVAL',
    'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'DELIVERED', 'CANCELLED'
  ));

-- ------------------------------------------------------------
-- 2) Kabul bilgileri: mevcut hasar / çizikler, teslim alınan aksesuarlar.
--    Müşteri şikâyeti customer_complaint alanında zaten var.
-- ------------------------------------------------------------
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS existing_damage       TEXT,
  ADD COLUMN IF NOT EXISTS received_accessories  TEXT;

-- ------------------------------------------------------------
-- 3) Durum geçmişi: aktör bilgisi ve değiştirilemezlik (AC-017).
-- ------------------------------------------------------------
ALTER TABLE service_status_history
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE RULE no_update_service_status_history AS ON UPDATE TO service_status_history DO INSTEAD NOTHING;
CREATE RULE no_delete_service_status_history AS ON DELETE TO service_status_history DO INSTEAD NOTHING;
