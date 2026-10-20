-- ============================================================
-- Migration: 005_sync_changes.sql
-- FAZ 1 — Cihazlar arası artımlı eşitleme günlüğü
-- ============================================================

CREATE TABLE sync_changes (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  table_name    TEXT NOT NULL,
  record_id     UUID NOT NULL,
  operation     TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  record        JSONB,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_changes_business_cursor
  ON sync_changes(business_id, id);

CREATE OR REPLACE FUNCTION current_business_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_id
  FROM users
  WHERE id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION current_business_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_business_id() TO authenticated;

ALTER TABLE public.sync_changes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'businesses',
    'users',
    'devices',
    'audit_logs',
    'customers',
    'machines',
    'suppliers',
    'opening_balances',
    'products',
    'product_serial_units',
    'stock_movements',
    'payments',
    'payment_allocations',
    'import_batches',
    'services',
    'service_parts',
    'service_status_history',
    'sales',
    'sale_items',
    'purchases',
    'purchase_items',
    'return_transactions',
    'return_items',
    'notifications',
    'sync_changes'
  ]
  LOOP
    FOR policy_name IN
      SELECT policies.policyname
      FROM pg_policies AS policies
      WHERE policies.schemaname = 'public'
        AND policies.tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
    END LOOP;

    IF table_name = 'businesses' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
         USING (id = public.current_business_id())
         WITH CHECK (id = public.current_business_id())',
        table_name || '_isolation',
        table_name
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
         USING (business_id = public.current_business_id())
         WITH CHECK (business_id = public.current_business_id())',
        table_name || '_isolation',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

GRANT SELECT ON sync_changes TO authenticated;

CREATE OR REPLACE FUNCTION capture_sync_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_record JSONB;
  changed_business_id UUID;
  changed_record_id UUID;
  change_operation TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    changed_record := NULL;
    changed_business_id := OLD.business_id;
    changed_record_id := OLD.id;
    change_operation := 'DELETE';
  ELSE
    changed_record := to_jsonb(NEW);
    changed_business_id := NEW.business_id;
    changed_record_id := NEW.id;
    change_operation := TG_OP;
  END IF;

  INSERT INTO sync_changes (
    business_id,
    table_name,
    record_id,
    operation,
    record
  )
  VALUES (
    changed_business_id,
    TG_TABLE_NAME,
    changed_record_id,
    change_operation,
    changed_record
  );

  RETURN NULL;
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
    'stock_movements',
    'payments',
    'payment_allocations',
    'import_batches',
    'services',
    'service_parts',
    'service_status_history',
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
      'CREATE TRIGGER trg_%I_sync_changes
       AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.capture_sync_change()',
      table_name,
      table_name
    );

    EXECUTE format(
      'INSERT INTO public.sync_changes (
         business_id,
         table_name,
         record_id,
         operation,
         record
       )
       SELECT business_id, %L, id, %L, to_jsonb(records)
       FROM public.%I AS records',
      table_name,
      'INSERT',
      table_name
    );
  END LOOP;
END;
$$;
