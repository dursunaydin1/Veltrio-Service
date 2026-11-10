-- ============================================================
-- 028 · Patron ve çalışanlar (K-119)
-- Bir işletmede bir patron (owner) ve birden çok çalışan (staff) olabilir. Patron her
-- şeyi yapar; çalışan günlük işleri (satış, servis, teslim, tahsilat, müşteri) yapar,
-- geri kalanı patronun verdiği izinlere bağlıdır. İzin listesi src/lib/auth/permissions.ts
-- ile aynıdır.
--
-- Kurallar yalnızca ekranda değil burada da uygulanır: tarayıcıdaki oturum veritabanına
-- doğrudan istek atabildiği için kısıtlayıcı (RESTRICTIVE) RLS politikaları ve BEFORE
-- tetikleyicileri izinsiz yazmayı reddeder. Patron için hiçbir şey değişmez; tek
-- kullanıcılı işletme bugünkü gibi çalışır.
-- SQL Editor / servis rolü (auth.uid() boş) kurallara takılmaz; bakım ve yedek etkilenmez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Kullanıcı rolü, durumu ve izinleri
-- ------------------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'staff'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Tanınan izinler (permissions.ts → STAFF_PERMISSIONS ile aynı)
CREATE OR REPLACE FUNCTION public.valid_staff_permissions(p TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p, '{}') <@ ARRAY[
    'view_costs', 'reports', 'purchases', 'products', 'cancel', 'discount', 'credit_sale'
  ]::TEXT[]
$$;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_permissions_check;
ALTER TABLE public.users ADD CONSTRAINT users_permissions_check CHECK (public.valid_staff_permissions(permissions));

-- Kullanıcı satırı tarayıcıdan değiştirilemez (çalışan kendini patron yapamasın);
-- değişiklikler aşağıdaki güvenli fonksiyonlarla yapılır.
REVOKE INSERT, UPDATE, DELETE ON public.users FROM authenticated, anon;

-- ------------------------------------------------------------
-- 2) Yardımcı fonksiyonlar
-- ------------------------------------------------------------
-- Oturum açan kullanıcı etkin mi? Oturum yoksa (servis rolü) true.
CREATE OR REPLACE FUNCTION public.current_user_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NULL
      OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active)
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NULL
      OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner' AND is_active)
$$;

-- Patron her şeyi yapar; çalışan yalnızca verilen izni.
CREATE OR REPLACE FUNCTION public.staff_can(p_permission TEXT)
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
          AND (role = 'owner' OR p_permission = ANY (permissions))
      )
$$;

REVOKE ALL ON FUNCTION public.current_user_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_can(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_can(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_permission(p_permission TEXT, p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT public.staff_can(p_permission) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok: %. Patronunuzdan izin isteyin.', p_label
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 3) Pasif kullanıcı hiçbir işletme verisine erişemez
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'businesses', 'devices', 'audit_logs', 'sync_changes', 'business_backups',
    'customers', 'machines', 'machine_ownership_history', 'suppliers', 'opening_balances',
    'products', 'product_serial_units', 'stock_movements', 'payments', 'payment_allocations',
    'import_batches', 'services', 'service_parts', 'service_operations', 'service_approvals',
    'service_status_history', 'service_checklist_items', 'operation_catalog', 'issue_catalog',
    'service_templates', 'service_template_items', 'sales', 'sale_items', 'purchases',
    'purchase_items', 'return_transactions', 'return_items', 'notifications'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_active_user', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE TO authenticated USING (public.current_user_active())',
        t || '_active_user', t
      );
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 4) Yalnızca patron: işletme ayarları, yedek, açılış bakiyesi, içe aktarma
--    Cihaz: herkes kendi cihazını, patron hepsini günceller (iptal).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS businesses_owner_update ON public.businesses;
CREATE POLICY businesses_owner_update ON public.businesses
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.current_user_is_owner());

DROP POLICY IF EXISTS business_backups_owner_insert ON public.business_backups;
CREATE POLICY business_backups_owner_insert ON public.business_backups
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.current_user_is_owner());

DROP POLICY IF EXISTS devices_own_update ON public.devices;
CREATE POLICY devices_own_update ON public.devices
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_owner());

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['opening_balances', 'import_batches'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.current_user_is_owner())',
      t || '_owner_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.current_user_is_owner())',
      t || '_owner_update', t
    );
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 5) İzne bağlı yazma kuralları (BEFORE tetikleyicileri)
--    Satır düzeyinde: ne değiştiğine bakılır (ör. taslak satış iptali serbest,
--    kesinleşmiş satış iptali "cancel" izni ister).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_staff_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Patron ve servis rolü için hızlı çıkış
  IF public.current_user_is_owner() THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'suppliers', 'purchases', 'purchase_items' THEN
      PERFORM public.require_permission('purchases', 'satın alma ve tedarikçi');

    WHEN 'products' THEN
      PERFORM public.require_permission('products', 'ürün ekleme / düzenleme');

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

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'suppliers', 'purchases', 'purchase_items', 'products', 'stock_movements', 'payments',
    'return_transactions', 'return_items', 'sales', 'sale_items', 'services'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_staff', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_permissions()',
      'trg_' || t || '_staff', t
    );
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 6) Çalışan daveti
--    Patron bir davet kodu üretir; çalışan kendi e-postasıyla hesap açar, ilk
--    kurulum ekranında "Davet koduyla katıl" der. Kod 7 gün geçerlidir, bir kez kullanılır.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_invites (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  permissions  TEXT[] NOT NULL DEFAULT '{}' CHECK (public.valid_staff_permissions(permissions)),
  created_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  used_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  used_at      TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_staff_invites_business ON public.staff_invites(business_id, created_at DESC);

ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.staff_invites FROM authenticated, anon;

DROP POLICY IF EXISTS staff_invites_owner_select ON public.staff_invites;
CREATE POLICY staff_invites_owner_select ON public.staff_invites
  FOR SELECT TO authenticated
  USING (business_id = public.current_business_id() AND public.current_user_is_owner());

-- Patron: davet kodu üret
CREATE OR REPLACE FUNCTION public.create_staff_invite(p_name TEXT, p_permissions TEXT[])
RETURNS public.staff_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chars   CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code    TEXT;
  v_invite  public.staff_invites;
  v_attempt INT := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_owner() THEN
    RAISE EXCEPTION 'Çalışan eklemeyi yalnızca patron yapabilir.' USING ERRCODE = '42501';
  END IF;
  p_name := btrim(COALESCE(p_name, ''));
  IF length(p_name) = 0 OR length(p_name) > 80 THEN
    RAISE EXCEPTION 'Çalışan adı 1-80 karakter olmalıdır.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.valid_staff_permissions(p_permissions) THEN
    RAISE EXCEPTION 'Geçersiz izin.' USING ERRCODE = '22023';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := (
      SELECT string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '')
      FROM generate_series(1, 8)
    );
    BEGIN
      INSERT INTO public.staff_invites (business_id, code, name, permissions, created_by)
      VALUES (public.current_business_id(), v_code, p_name, COALESCE(p_permissions, '{}'), auth.uid())
      RETURNING * INTO v_invite;
      RETURN v_invite;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 10 THEN
        RAISE EXCEPTION 'Davet kodu üretilemedi, tekrar deneyin.';
      END IF;
    END;
  END LOOP;
END;
$$;

-- Patron: kullanılmamış daveti iptal et
CREATE OR REPLACE FUNCTION public.revoke_staff_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_owner() THEN
    RAISE EXCEPTION 'Bu işlemi yalnızca patron yapabilir.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.staff_invites
  SET revoked_at = NOW()
  WHERE id = p_invite_id AND business_id = public.current_business_id()
    AND used_at IS NULL AND revoked_at IS NULL;
END;
$$;

-- Çalışan: davet koduyla işletmeye katıl (henüz işletmesi olmayan hesap)
CREATE OR REPLACE FUNCTION public.accept_staff_invite(p_code TEXT)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_email  TEXT;
  v_invite public.staff_invites;
  v_user   public.users;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum açmanız gerekiyor.' USING ERRCODE = '28000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Bu hesap zaten bir işletmeye bağlı.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invite
  FROM public.staff_invites
  WHERE code = upper(btrim(COALESCE(p_code, '')))
  FOR UPDATE;

  IF NOT FOUND OR v_invite.revoked_at IS NOT NULL OR v_invite.used_at IS NOT NULL
     OR v_invite.expires_at < NOW() THEN
    RAISE EXCEPTION 'Davet kodu geçersiz ya da süresi dolmuş. Patronunuzdan yeni kod isteyin.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.users (id, business_id, email, name, role, permissions)
  VALUES (v_uid, v_invite.business_id, COALESCE(v_email, ''), v_invite.name, 'staff', v_invite.permissions)
  RETURNING * INTO v_user;

  UPDATE public.staff_invites SET used_by = v_uid, used_at = NOW() WHERE id = v_invite.id;

  RETURN v_user;
END;
$$;

-- Patron: çalışanın izinlerini değiştir
CREATE OR REPLACE FUNCTION public.set_staff_permissions(p_user_id UUID, p_permissions TEXT[])
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_owner() THEN
    RAISE EXCEPTION 'İzinleri yalnızca patron değiştirebilir.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.valid_staff_permissions(p_permissions) THEN
    RAISE EXCEPTION 'Geçersiz izin.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.users
  SET permissions = COALESCE(p_permissions, '{}')
  WHERE id = p_user_id AND business_id = public.current_business_id() AND role = 'staff'
  RETURNING * INTO v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Çalışan bulunamadı.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_user;
END;
$$;

-- Patron: çalışanı pasifleştir / yeniden etkinleştir. Pasifleştirmede çalışanın
-- bütün cihazları iptal edilir; telefonundaki yerel veri cihaz bekçisiyle silinir (AC-045).
CREATE OR REPLACE FUNCTION public.set_staff_active(p_user_id UUID, p_active BOOLEAN)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_owner() THEN
    RAISE EXCEPTION 'Bu işlemi yalnızca patron yapabilir.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.users
  SET is_active = p_active,
      deactivated_at = CASE WHEN p_active THEN NULL ELSE NOW() END
  WHERE id = p_user_id AND business_id = public.current_business_id() AND role = 'staff'
  RETURNING * INTO v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Çalışan bulunamadı.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT p_active THEN
    UPDATE public.devices
    SET is_active = FALSE, revoked_at = COALESCE(revoked_at, NOW())
    WHERE user_id = p_user_id AND business_id = v_user.business_id AND revoked_at IS NULL;
  END IF;
  RETURN v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_invite(TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_staff_invite(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_staff_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_staff_permissions(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_staff_active(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff_invite(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_staff_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_staff_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_permissions(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_active(UUID, BOOLEAN) TO authenticated;
