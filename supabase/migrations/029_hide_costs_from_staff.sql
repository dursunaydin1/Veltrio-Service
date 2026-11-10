-- ============================================================
-- 029 · Maliyet ve alış bilgisi çalışanın cihazına gitmez (K-120)
-- 028'de alış fiyatı, kâr ve alış belgeleri çalışandan yalnızca ekranda gizleniyordu;
-- veri internetsiz çalışma için çalışanın telefonuna da iniyordu ve oturum, tablolara
-- doğrudan sorgu atarak okuyabiliyordu. Bundan sonra:
--   · Eşitleme verisi `pull_sync_changes` ile verilir; izni olmayan çalışan için maliyet
--     sütunları silinir, alış / tedarikçi kayıtları hiç gönderilmez (yerelde varsa silinir).
--   · Eşitleme günlüğü ve maliyet sütunları doğrudan okunamaz (patron dahil; patron da
--     yalnızca yukarıdaki fonksiyonlarla okur). Alış / tedarikçi satırları izinsize kapalıdır.
--   · Çalışanın yazdığı satış / servis satırı ve stok hareketinin maliyetini sunucu doldurur;
--     patronun kâr raporu bozulmaz. Çalışanın ürün düzenlemesi alış fiyatını silmez.
--   · 028'deki hata: satışta stok özetini güncelleyen tetikleyici, ürün izni olmayan
--     çalışanın stok hareketini "ürün düzenleme" sayıp reddediyordu.
--
-- Kim ne görür (permissions.ts → seesCosts / seesPurchases ile aynı):
--   maliyet: patron, ya da view_costs / purchases / reports izni olan çalışan
--   alış ve tedarikçi kayıtları: patron, ya da purchases / reports izni olan çalışan
-- SQL Editor / servis rolü (auth.uid() boş) her şeyi görür; yedek görevi etkilenmez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Kim neyi görür
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_sees_costs()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NULL
      OR EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND is_active
          AND (role = 'owner' OR permissions && ARRAY['view_costs', 'purchases', 'reports']::TEXT[])
      )
$$;

CREATE OR REPLACE FUNCTION public.staff_sees_purchases()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NULL
      OR EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND is_active
          AND (role = 'owner' OR permissions && ARRAY['purchases', 'reports']::TEXT[])
      )
$$;

REVOKE ALL ON FUNCTION public.staff_sees_costs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_sees_purchases() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_sees_costs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_sees_purchases() TO authenticated;

-- ------------------------------------------------------------
-- 2) Kaydı izne göre süzme
--    NULL dönerse kayıt bu kullanıcıya hiç gösterilmez.
-- ------------------------------------------------------------
-- Denetim kaydının ait olduğu belge alış tarafında mı?
CREATE OR REPLACE FUNCTION public.audit_entity_is_purchase_side(p_type TEXT, p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_type IN ('suppliers', 'purchases', 'purchase_items') THEN TRUE
    WHEN p_type = 'payments' THEN
      EXISTS (SELECT 1 FROM public.payments WHERE id = p_id AND supplier_id IS NOT NULL)
    WHEN p_type = 'opening_balances' THEN
      EXISTS (SELECT 1 FROM public.opening_balances WHERE id = p_id AND party_type = 'SUPPLIER')
    WHEN p_type = 'return_transactions' THEN
      EXISTS (SELECT 1 FROM public.return_transactions WHERE id = p_id AND original_type = 'PURCHASE')
    ELSE FALSE
  END
$$;

-- Denetim kaydının eski / yeni değerinden maliyet alanlarını çıkarır
CREATE OR REPLACE FUNCTION public.strip_cost_keys(p_value JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_value) = 'object'
      THEN p_value - ARRAY['last_purchase_price', 'unit_cost', 'unit_cost_snapshot']::TEXT[]
    ELSE p_value
  END
$$;

CREATE OR REPLACE FUNCTION public.redact_sync_record(
  p_table TEXT,
  p_record JSONB,
  p_costs BOOLEAN,
  p_purchases BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_record IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT p_purchases THEN
    IF p_table IN ('suppliers', 'purchases', 'purchase_items')
       OR (p_table = 'payments' AND p_record->>'supplier_id' IS NOT NULL)
       OR (p_table = 'payment_allocations' AND p_record->>'source_type' = 'PURCHASE')
       OR (p_table = 'opening_balances' AND p_record->>'party_type' = 'SUPPLIER')
       OR (p_table = 'return_transactions' AND p_record->>'original_type' = 'PURCHASE')
       OR (p_table = 'return_items' AND p_record->>'original_line_type' = 'PURCHASE_ITEM')
       OR (p_table = 'audit_logs'
           AND public.audit_entity_is_purchase_side(p_record->>'entity_type', (p_record->>'entity_id')::UUID))
    THEN
      RETURN NULL;
    END IF;
  END IF;

  IF NOT p_costs THEN
    CASE p_table
      WHEN 'products' THEN
        RETURN p_record - 'last_purchase_price';
      WHEN 'stock_movements' THEN
        RETURN p_record - 'unit_cost';
      WHEN 'sale_items', 'service_parts' THEN
        RETURN p_record - 'unit_cost_snapshot';
      WHEN 'audit_logs' THEN
        RETURN p_record
          || jsonb_build_object(
               'old_value', public.strip_cost_keys(p_record->'old_value'),
               'new_value', public.strip_cost_keys(p_record->'new_value')
             );
      ELSE
        NULL;
    END CASE;
  END IF;

  RETURN p_record;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_entity_is_purchase_side(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redact_sync_record(TEXT, JSONB, BOOLEAN, BOOLEAN) FROM PUBLIC;

-- ------------------------------------------------------------
-- 3) Eşitleme verisini okuma
--    Gizli kayıt, cihazda kalmışsa silinsin diye DELETE olarak bildirilir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pull_sync_changes(p_cursor BIGINT, p_limit INT DEFAULT 500)
RETURNS TABLE (
  id TEXT,
  table_name TEXT,
  record_id UUID,
  operation TEXT,
  record JSONB,
  changed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_business UUID := public.current_business_id();
  v_costs BOOLEAN := public.staff_sees_costs();
  v_purchases BOOLEAN := public.staff_sees_purchases();
BEGIN
  IF auth.uid() IS NULL OR v_business IS NULL OR NOT public.current_user_active() THEN
    RAISE EXCEPTION 'Eşitleme için yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      c.id::TEXT,
      c.table_name,
      c.record_id,
      CASE WHEN c.operation <> 'DELETE' AND r.rec IS NULL THEN 'DELETE' ELSE c.operation END,
      r.rec,
      c.changed_at
    FROM public.sync_changes AS c
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN c.operation = 'DELETE' THEN NULL
        ELSE public.redact_sync_record(c.table_name, c.record, v_costs, v_purchases)
      END AS rec
    ) AS r
    WHERE c.business_id = v_business
      AND c.id > p_cursor
    ORDER BY c.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);
END;
$$;

-- Eşitleme günlüğünün son imleci (e2e testi ve tanılama için)
CREATE OR REPLACE FUNCTION public.latest_sync_cursor()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(id), 0)
  FROM public.sync_changes
  WHERE business_id = public.current_business_id()
    AND public.current_user_active()
$$;

-- Tek kaydın sunucudaki hâli (çakışma çözümü: "sunucudaki sürümü al").
-- Tablo listesi src/lib/sync/tables.ts → SYNC_TABLES ile aynıdır (test karşılaştırır).
CREATE OR REPLACE FUNCTION public.read_sync_record(p_table TEXT, p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business UUID := public.current_business_id();
  v_row JSONB;
BEGIN
  IF auth.uid() IS NULL OR v_business IS NULL OR NOT public.current_user_active() THEN
    RAISE EXCEPTION 'Kayıt okuma yetkiniz yok.' USING ERRCODE = '42501';
  END IF;
  IF NOT (p_table = ANY (ARRAY[
    'audit_logs', 'customers', 'machines', 'machine_ownership_history', 'suppliers',
    'opening_balances', 'products', 'product_serial_units', 'stock_movements', 'payments',
    'payment_allocations', 'import_batches', 'services', 'service_parts', 'service_operations',
    'service_approvals', 'service_status_history', 'service_checklist_items', 'operation_catalog',
    'issue_catalog', 'service_templates', 'service_template_items', 'sales', 'sale_items',
    'purchases', 'purchase_items', 'return_transactions', 'return_items', 'notifications'
  ]::TEXT[])) THEN
    RAISE EXCEPTION 'Bilinmeyen tablo: %', p_table USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I AS t WHERE t.id = $1 AND t.business_id = $2', p_table)
    INTO v_row
    USING p_id, v_business;

  RETURN public.redact_sync_record(p_table, v_row, public.staff_sees_costs(), public.staff_sees_purchases());
END;
$$;

REVOKE ALL ON FUNCTION public.pull_sync_changes(BIGINT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.latest_sync_cursor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_sync_record(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pull_sync_changes(BIGINT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.latest_sync_cursor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_sync_record(TEXT, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4) Doğrudan okuma kapanır
--    Eşitleme günlüğü yalnızca yukarıdaki fonksiyonlarla okunur. Maliyet sütunları
--    tarayıcı oturumuna kapalıdır; yazma (ekleme / güncelleme) etkilenmez.
--    DİKKAT: bu tablolara ileride sütun eklenirse okuma izni ayrıca verilmelidir:
--    GRANT SELECT (yeni_sutun) ON public.<tablo> TO authenticated;
-- ------------------------------------------------------------
REVOKE SELECT ON public.sync_changes FROM authenticated, anon;

DO $$
DECLARE
  r RECORD;
  cols TEXT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('products',        ARRAY['last_purchase_price']),
      ('stock_movements', ARRAY['unit_cost']),
      ('sale_items',      ARRAY['unit_cost_snapshot']),
      ('service_parts',   ARRAY['unit_cost_snapshot']),
      ('audit_logs',      ARRAY['old_value', 'new_value'])
    ) AS v(t, hidden)
  LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO cols
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = r.t
        AND column_name <> ALL (r.hidden);

    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated, anon', r.t);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, r.t);
  END LOOP;
END;
$$;

-- Alış tarafı satırları: izni olmayan çalışan okuyamaz
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('suppliers',           'TRUE'),
      ('purchases',           'TRUE'),
      ('purchase_items',      'TRUE'),
      ('payments',            'supplier_id IS NOT NULL'),
      ('payment_allocations', 'source_type = ''PURCHASE'''),
      ('opening_balances',    'party_type = ''SUPPLIER'''),
      ('return_transactions', 'original_type = ''PURCHASE'''),
      ('return_items',        'original_line_type = ''PURCHASE_ITEM'''),
      ('audit_logs',          'entity_type IN (''suppliers'', ''purchases'', ''purchase_items'')')
    ) AS v(t, purchase_side)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.t || '_purchase_side_select', r.t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
       USING (NOT (%s) OR (SELECT public.staff_sees_purchases()))',
      r.t || '_purchase_side_select', r.t, r.purchase_side
    );
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 5) Çalışanın yazdığı maliyeti sunucu belirler
--    Maliyeti görmeyen çalışanın cihazında alış fiyatı yoktur: satır maliyetini 0 ya da
--    boş gönderir, ürün düzenlemesinde alış fiyatını boş gönderir. Patron ve maliyeti
--    gören çalışan için hiçbir şey değişmez.
-- ------------------------------------------------------------
-- İstemcideki kuralla aynı: seri birimde ilk giriş hareketinin maliyeti, yoksa ürünün
-- son alış fiyatı (sales/service.ts, services/quote.ts).
CREATE OR REPLACE FUNCTION public.server_unit_cost(p_business UUID, p_product UUID, p_serial UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT m.unit_cost
       FROM public.stock_movements AS m
      WHERE p_serial IS NOT NULL
        AND m.business_id = p_business
        AND m.serial_unit_id = p_serial
        AND m.quantity > 0
        AND m.unit_cost IS NOT NULL
      ORDER BY m.created_at ASC
      LIMIT 1),
    (SELECT p.last_purchase_price FROM public.products AS p
      WHERE p.id = p_product AND p.business_id = p_business),
    0
  )
$$;

REVOKE ALL ON FUNCTION public.server_unit_cost(UUID, UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.fill_staff_costs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.staff_sees_costs() THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'products' THEN
      IF TG_OP = 'UPDATE' THEN
        NEW.last_purchase_price := OLD.last_purchase_price;
      ELSE
        NEW.last_purchase_price := NULL;
      END IF;

    WHEN 'stock_movements' THEN
      IF NEW.reversal_of_id IS NOT NULL THEN
        NEW.unit_cost := (SELECT m.unit_cost FROM public.stock_movements AS m WHERE m.id = NEW.reversal_of_id);
      ELSIF NEW.product_id IS NOT NULL THEN
        NEW.unit_cost := public.server_unit_cost(NEW.business_id, NEW.product_id, NEW.serial_unit_id);
      ELSE
        NEW.unit_cost := NULL;
      END IF;

    WHEN 'sale_items', 'service_parts' THEN
      -- Kesinleşmiş satırın maliyeti sonradan değişmez; ürün, birim ya da stok
      -- hareketi değişince (kesinleştirme) yeniden hesaplanır.
      IF TG_OP = 'UPDATE'
         AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id
         AND NEW.serial_unit_id IS NOT DISTINCT FROM OLD.serial_unit_id
         AND NEW.stock_movement_id IS NOT DISTINCT FROM OLD.stock_movement_id THEN
        NEW.unit_cost_snapshot := OLD.unit_cost_snapshot;
      ELSIF NEW.product_id IS NOT NULL THEN
        NEW.unit_cost_snapshot := public.server_unit_cost(NEW.business_id, NEW.product_id, NEW.serial_unit_id);
      ELSE
        NEW.unit_cost_snapshot := 0;
      END IF;

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- Ad sırası önemli: BEFORE tetikleyicileri ada göre çalışır; "cost" < "staff" < "version",
-- böylece izin denetimi ve sürüm artırımı korunmuş alış fiyatını görür.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'stock_movements', 'sale_items', 'service_parts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_cost_fill', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fill_staff_costs()',
      'trg_' || t || '_cost_fill', t
    );
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 6) İzin tetikleyicisi (028) düzeltmesi: ürün
--    · Yalnızca stok özeti değişen güncelleme (stok hareketi tetikleyicisi) serbesttir;
--      önceden ürün izni olmayan çalışanın satışındaki stok çıkışı reddediliyordu.
--    · Yalnızca alış fiyatı değişen güncelleme (alış faturası) "purchases" ister.
--    Diğer bölümler 028 ile aynıdır.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_staff_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ignored CONSTANT TEXT[] := ARRAY['stock_available', 'stock_damaged', 'updated_at', 'version', 'last_purchase_price'];
BEGIN
  -- Patron ve servis rolü için hızlı çıkış
  IF public.current_user_is_owner() THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'suppliers', 'purchases', 'purchase_items' THEN
      PERFORM public.require_permission('purchases', 'satın alma ve tedarikçi');

    WHEN 'products' THEN
      IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - ignored) = (to_jsonb(OLD) - ignored) THEN
        IF NEW.last_purchase_price IS DISTINCT FROM OLD.last_purchase_price THEN
          PERFORM public.require_permission('purchases', 'alış fiyatı güncelleme');
        END IF;
      ELSE
        PERFORM public.require_permission('products', 'ürün ekleme / düzenleme');
      END IF;

    WHEN 'stock_movements' THEN
      IF NEW.movement_type IN ('OPENING', 'PURCHASE_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
                               'DAMAGED_DISPOSE', 'TRANSFER') THEN
        PERFORM public.require_permission('purchases', 'stok girişi / sayım');
      END IF;

    WHEN 'payments' THEN
      IF NEW.supplier_id IS NOT NULL THEN
        PERFORM public.require_permission('purchases', 'tedarikçi ödemesi');
      ELSIF NEW.reversal_of_id IS NOT NULL OR NEW.direction = 'OUT' THEN
        PERFORM public.require_permission('cancel', 'ödeme iptali / iade');
      END IF;

    WHEN 'return_transactions', 'return_items' THEN
      PERFORM public.require_permission('cancel', 'iade / ters kayıt');

    WHEN 'sales' THEN
      IF TG_OP = 'UPDATE' AND OLD.status = 'FINAL' AND NEW.status = 'CANCELLED' THEN
        PERFORM public.require_permission('cancel', 'satış iptali');
      END IF;
      IF NEW.discount_total > 0
         AND (TG_OP = 'INSERT' OR NEW.discount_total IS DISTINCT FROM OLD.discount_total) THEN
        PERFORM public.require_permission('discount', 'indirim');
      END IF;

    WHEN 'sale_items' THEN
      IF NEW.discount_amount > 0
         AND (TG_OP = 'INSERT' OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount) THEN
        PERFORM public.require_permission('discount', 'indirim');
      END IF;

    WHEN 'services' THEN
      IF TG_OP = 'UPDATE' AND NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
        PERFORM public.require_permission('cancel', 'servis iptali');
      END IF;

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;
