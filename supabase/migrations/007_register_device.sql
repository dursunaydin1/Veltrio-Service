-- ============================================================
-- Migration: 007_register_device.sql
-- FAZ 1 — Cihaz kodu sunucuda atanır (FR-002, karar günlüğü K-002/K-014)
-- ============================================================

-- ------------------------------------------------------------
-- 1) register_device: oturum açmış kullanıcının işletmesi için yeni cihaz kaydeder.
--    Kod = işletme öneki + "-" + 4 karakter (I, O, 0, 1 hariç). Çakışırsa yeniden dener.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_device(p_device_name TEXT)
RETURNS public.devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     public.users%ROWTYPE;
  v_prefix   TEXT;
  v_chars    CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     TEXT;
  v_device   public.devices%ROWTYPE;
  v_attempt  INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum açmanız gerekiyor.' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bir işletmeye bağlı değil.' USING ERRCODE = 'P0002';
  END IF;

  p_device_name := btrim(COALESCE(p_device_name, ''));
  IF length(p_device_name) = 0 OR length(p_device_name) > 60 THEN
    RAISE EXCEPTION 'Cihaz adı 1-60 karakter olmalıdır.' USING ERRCODE = '22023';
  END IF;

  SELECT device_code_prefix INTO v_prefix
  FROM public.businesses
  WHERE id = v_user.business_id;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := v_prefix || '-' || (
      SELECT string_agg(
        substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), ''
      )
      FROM generate_series(1, 4)
    );

    BEGIN
      INSERT INTO public.devices (business_id, user_id, device_code, device_name)
      VALUES (v_user.business_id, v_user.id, v_code, p_device_name)
      RETURNING * INTO v_device;

      RETURN v_device;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 10 THEN
        RAISE EXCEPTION 'Benzersiz cihaz kodu üretilemedi, tekrar deneyin.';
      END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.register_device(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2) Tarayıcı artık devices tablosuna doğrudan ekleme yapamaz; yalnızca
--    güvenli alanları güncelleyebilir (cihaz kodu / sahip değiştirilemez).
-- ------------------------------------------------------------
REVOKE INSERT ON public.devices FROM authenticated, anon;
REVOKE UPDATE ON public.devices FROM authenticated, anon;
GRANT UPDATE (device_name, last_synced_at, is_active, revoked_at)
  ON public.devices TO authenticated;

-- ------------------------------------------------------------
-- 3) İptal edilen cihaz yeniden etkinleştirilemez (AC-045).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_device_reactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND (NEW.is_active OR NEW.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'İptal edilen cihaz yeniden etkinleştirilemez.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_devices_no_reactivation ON public.devices;
CREATE TRIGGER trg_devices_no_reactivation
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_device_reactivation();
