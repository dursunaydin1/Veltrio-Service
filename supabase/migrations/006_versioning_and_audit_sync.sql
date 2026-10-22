-- ============================================================
-- Migration: 006_versioning_and_audit_sync.sql
-- FAZ 1 — Kayıt sürümü (çakışma tespiti), audit log eşitleme, ayar varsayılanları
-- Karar günlüğü: K-006, K-007, K-009
-- ============================================================

-- ------------------------------------------------------------
-- 1) version: değiştirilebilir eşitlenen tablolarda kayıt sürümü
--    Her UPDATE'te tetikleyici +1 artırır. İstemci, düzenlemeye başladığı
--    sürümü gönderir; sunucu farklıysa çakışma sayılır (push API).
--    Yalnızca-ekleme tabloları (stock_movements, payments,
--    payment_allocations, service_status_history, audit_logs) güncellenmez,
--    bu yüzden sürüm sütunu almazlar.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION bump_record_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'customers',
    'machines',
    'suppliers',
    'opening_balances',
    'products',
    'product_serial_units',
    'import_batches',
    'services',
    'service_parts',
    'sales',
    'sale_items',
    'purchases',
    'purchase_items',
    'return_transactions',
    'return_items',
    'notifications'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1',
      table_name
    );

    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_version ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_version
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.bump_record_version()',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 2) audit_logs: aktör ve gerekçe alanları + cihazlar arası eşitleme
--    (Adım 1.8: aktör, cihaz, tarih, eski/yeni değer, gerekçe)
-- ------------------------------------------------------------
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reason   TEXT;

DROP TRIGGER IF EXISTS trg_audit_logs_sync_changes ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_sync_changes
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.capture_sync_change();

-- Önceden yazılmış kayıtlar varsa onları da eşitleme günlüğüne al
INSERT INTO public.sync_changes (business_id, table_name, record_id, operation, record)
SELECT business_id, 'audit_logs', id, 'INSERT', to_jsonb(records)
FROM public.audit_logs AS records;

-- ------------------------------------------------------------
-- 3) İşletme ayarlarının varsayılanları (Adım 1.4)
--    Var olan anahtarlar korunur; eksik olanlar tamamlanır.
-- ------------------------------------------------------------
ALTER TABLE businesses ALTER COLUMN settings SET DEFAULT '{
  "default_tax_mode": "INCLUSIVE",
  "default_tax_rate": 20,
  "currency": "TRY",
  "service_approval_threshold": 1000,
  "allow_negative_stock": false,
  "default_service_reminder_days": 1,
  "max_offline_days": 30,
  "locale": "tr-TR"
}'::jsonb;

UPDATE businesses
SET settings = '{
  "allow_negative_stock": false,
  "max_offline_days": 30
}'::jsonb || settings;
