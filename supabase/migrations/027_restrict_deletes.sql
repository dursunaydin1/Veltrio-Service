-- ============================================================
-- 027 · Ana kayıtlarda silme yasağı (K-104)
-- Eşitleme API'si zaten yalnızca taslak satırlarının silinmesine izin veriyor
-- (DELETABLE_SYNC_TABLES). Tarayıcıdaki oturum veritabanına doğrudan da istek atabildiği
-- için aynı kural burada da konur: kısıtlayıcı (RESTRICTIVE) bir RLS politikası, oturum
-- açmış kullanıcının bu tablolardan satır silmesini engeller.
-- SQL Editor / servis rolü RLS'e tabi değildir; bakım ve tek seferlik temizlik etkilenmez.
-- stock_movements ve audit_logs zaten RULE ile korunuyor (009, 001).
-- ============================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers', 'machines', 'machine_ownership_history', 'suppliers', 'opening_balances',
    'products', 'product_serial_units', 'payments', 'payment_allocations', 'import_batches',
    'services', 'service_approvals', 'service_status_history',
    'operation_catalog', 'issue_catalog', 'service_templates',
    'sales', 'purchases', 'return_transactions', 'return_items', 'notifications'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_delete', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (false)',
        t || '_no_delete', t
      );
    END IF;
  END LOOP;
END;
$$;
