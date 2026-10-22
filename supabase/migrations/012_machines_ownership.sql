-- ============================================================
-- Migration: 012_machines_ownership.sql
-- FAZ 3 / ADIM 3.3 — Makine iç numarası ve sahiplik geçmişi (K-008, K-020)
-- ============================================================

-- İç makine numarası (MK-[cihaz_kodu]-[sıra]); QR ve kısa kimlik için.
ALTER TABLE machines ADD COLUMN IF NOT EXISTS internal_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_machines_internal_number
  ON machines(business_id, internal_number)
  WHERE internal_number IS NOT NULL;

-- ------------------------------------------------------------
-- Sahiplik geçmişi: yalnızca-ekleme (AC-018). Makinenin sahibi değişince
-- eski/yeni müşteri, neden, aktör ve cihaz kaydedilir; servis geçmişi makineye
-- bağlı olduğu için korunur.
-- ------------------------------------------------------------
CREATE TABLE machine_ownership_history (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  machine_id         UUID NOT NULL REFERENCES machines(id),
  old_customer_id    UUID REFERENCES customers(id),
  new_customer_id    UUID REFERENCES customers(id),
  reason             TEXT NOT NULL,
  actor_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_by_device  TEXT NOT NULL,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_machine_ownership_machine  ON machine_ownership_history(machine_id, changed_at DESC);
CREATE INDEX idx_machine_ownership_business ON machine_ownership_history(business_id);

CREATE RULE no_update_machine_ownership AS ON UPDATE TO machine_ownership_history DO INSTEAD NOTHING;
CREATE RULE no_delete_machine_ownership AS ON DELETE TO machine_ownership_history DO INSTEAD NOTHING;

ALTER TABLE machine_ownership_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY machine_ownership_history_isolation ON machine_ownership_history
  USING (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE TRIGGER trg_machine_ownership_history_sync_changes
  AFTER INSERT ON machine_ownership_history
  FOR EACH ROW EXECUTE FUNCTION public.capture_sync_change();
