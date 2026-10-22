-- ============================================================
-- Migration: 014_service_lines_approvals.sql
-- FAZ 3 / ADIM 3.8-3.9 — İşlem / parça satırları ve müşteri onayı (K-008, K-022)
-- ============================================================

-- ------------------------------------------------------------
-- 1) İşlem (işçilik) satırları
--    status: müşteri kararı (PENDING → APPROVED / REJECTED / DEFERRED)
--    price_pending: fiyatı henüz bilinmiyor (SR-007); tamamlamayı engeller.
-- ------------------------------------------------------------
CREATE TABLE service_operations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id       UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  description      TEXT NOT NULL,
  quantity         DECIMAL(15,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price       DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_amount  DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_mode         TEXT NOT NULL DEFAULT 'INCLUSIVE'
                     CHECK (tax_mode IN ('INCLUSIVE', 'EXCLUSIVE', 'NONE')),
  tax_rate         DECIMAL(5,2) NOT NULL DEFAULT 20 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  line_total       DECIMAL(15,4) NOT NULL DEFAULT 0,
  price_pending    BOOLEAN NOT NULL DEFAULT FALSE,
  status           TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'DEFERRED')),
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_operations_service ON service_operations(service_id);

CREATE TRIGGER trg_service_operations_updated_at
  BEFORE UPDATE ON service_operations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_service_operations_version
  BEFORE UPDATE ON service_operations
  FOR EACH ROW EXECUTE FUNCTION public.bump_record_version();

ALTER TABLE service_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_operations_isolation ON service_operations
  USING (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE TRIGGER trg_service_operations_sync_changes
  AFTER INSERT OR UPDATE OR DELETE ON service_operations
  FOR EACH ROW EXECUTE FUNCTION public.capture_sync_change();

-- ------------------------------------------------------------
-- 2) Parça satırları (service_parts, migration 004) genişletilir.
--    `status` artık yalnızca müşteri kararıdır; temin durumu supply_status,
--    kullanım used_quantity ile izlenir.
-- ------------------------------------------------------------
ALTER TABLE service_parts
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'STOCK_PRODUCT'
    CHECK (source_type IN ('STOCK_PRODUCT', 'CUSTOMER_SUPPLIED', 'NON_STOCK_PURCHASE', 'OTHER')),
  ADD COLUMN IF NOT EXISTS used_quantity DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (used_quantity >= 0),
  ADD COLUMN IF NOT EXISTS supply_status TEXT NOT NULL DEFAULT 'IN_STOCK'
    CHECK (supply_status IN ('IN_STOCK', 'TO_ORDER', 'ORDERED', 'ARRIVED')),
  ADD COLUMN IF NOT EXISTS expected_at DATE,
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS tax_mode TEXT NOT NULL DEFAULT 'INCLUSIVE'
    CHECK (tax_mode IN ('INCLUSIVE', 'EXCLUSIVE', 'NONE')),
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) NOT NULL DEFAULT 20 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  ADD COLUMN IF NOT EXISTS line_total DECIMAL(15,4) NOT NULL DEFAULT 0;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.service_parts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%ARRIVED%'
    AND pg_get_constraintdef(oid) LIKE '%PENDING%'
    AND pg_get_constraintdef(oid) NOT LIKE '%supply_status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.service_parts DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

UPDATE service_parts SET status = 'APPROVED' WHERE status IN ('ARRIVED', 'USED');

ALTER TABLE service_parts
  ADD CONSTRAINT service_parts_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'DEFERRED'));

-- ------------------------------------------------------------
-- 3) Müşteri onay kayıtları: yalnızca-ekleme (AC-004, AC-042).
-- ------------------------------------------------------------
CREATE TABLE service_approvals (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id         UUID NOT NULL REFERENCES services(id),
  decision           TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'DEFERRED', 'PARTIAL')),
  method             TEXT NOT NULL CHECK (method IN ('IN_PERSON', 'PHONE', 'OTHER')),
  approved_amount    DECIMAL(15,4) NOT NULL DEFAULT 0,
  explanation        TEXT,
  actor_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_by_device  TEXT NOT NULL,
  decided_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_approvals_service ON service_approvals(service_id, decided_at DESC);

CREATE RULE no_update_service_approvals AS ON UPDATE TO service_approvals DO INSTEAD NOTHING;
CREATE RULE no_delete_service_approvals AS ON DELETE TO service_approvals DO INSTEAD NOTHING;

ALTER TABLE service_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_approvals_isolation ON service_approvals
  USING (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE TRIGGER trg_service_approvals_sync_changes
  AFTER INSERT ON service_approvals
  FOR EACH ROW EXECUTE FUNCTION public.capture_sync_change();
