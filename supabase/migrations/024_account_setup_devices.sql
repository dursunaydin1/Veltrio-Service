-- ============================================================
-- Migration: 024_account_setup_devices.sql
-- FAZ 1 / ADIM 1.4, 1.5 — İlk kurulum, cihaz yönetimi (K-039)
-- ============================================================

-- ------------------------------------------------------------
-- 1) İlk kurulum: yeni hesap için işletme + kullanıcı kaydı
--    Tarayıcı businesses / users tablosuna doğrudan ekleme yapamaz; kurulum bu
--    güvenli fonksiyonla, yalnızca oturum açmış ve henüz işletmesi olmayan
--    kullanıcı için yapılır.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.setup_business(
  p_name              TEXT,
  p_owner_name        TEXT,
  p_phone             TEXT DEFAULT NULL,
  p_address           TEXT DEFAULT NULL,
  p_tax_number        TEXT DEFAULT NULL,
  p_default_tax_mode  TEXT DEFAULT 'INCLUSIVE',
  p_default_tax_rate  NUMERIC DEFAULT 20
)
RETURNS public.businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_email    TEXT;
  v_prefix   TEXT;
  v_business public.businesses;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum açmanız gerekiyor.' USING ERRCODE = '28000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Bu hesap için işletme zaten kurulmuş.' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'İşletme adı zorunludur.';
  END IF;
  IF p_owner_name IS NULL OR btrim(p_owner_name) = '' THEN
    RAISE EXCEPTION 'Yetkili adı zorunludur.';
  END IF;
  IF p_default_tax_mode NOT IN ('INCLUSIVE', 'EXCLUSIVE', 'NONE') THEN
    RAISE EXCEPTION 'KDV varsayılanı geçersiz.';
  END IF;
  IF p_default_tax_rate < 0 OR p_default_tax_rate > 100 THEN
    RAISE EXCEPTION 'KDV oranı 0 ile 100 arasında olmalıdır.';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- Cihaz kodu öneki: işletme adının ASCII harf/rakamları (en çok 4), yoksa VLT
  v_prefix := substr(regexp_replace(upper(p_name), '[^A-Z0-9]', '', 'g'), 1, 4);
  IF length(v_prefix) < 2 THEN v_prefix := 'VLT'; END IF;

  INSERT INTO public.businesses (name, owner_name, phone, address, tax_number, device_code_prefix, settings)
  VALUES (
    btrim(p_name), btrim(p_owner_name), NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_address), ''),
    NULLIF(btrim(p_tax_number), ''), v_prefix,
    jsonb_build_object(
      'default_tax_mode', p_default_tax_mode,
      'default_tax_rate', p_default_tax_rate,
      'currency', 'TRY',
      'service_approval_threshold', 1000,
      'allow_negative_stock', false,
      'default_service_reminder_days', 1,
      'max_offline_days', 30,
      'locale', 'tr-TR'
    )
  )
  RETURNING * INTO v_business;

  INSERT INTO public.users (id, business_id, email, name, role)
  VALUES (v_uid, v_business.id, COALESCE(v_email, ''), btrim(p_owner_name), 'owner');

  RETURN v_business;
END;
$$;

REVOKE ALL ON FUNCTION public.setup_business(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_business(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;

-- ------------------------------------------------------------
-- 2) Cihaz iptali: yerel verinin silindiği zaman (AC-045)
-- ------------------------------------------------------------
ALTER TABLE devices ADD COLUMN IF NOT EXISTS wipe_confirmed_at TIMESTAMPTZ;

GRANT UPDATE (device_name, last_synced_at, is_active, revoked_at, wipe_confirmed_at)
  ON public.devices TO authenticated;

-- ------------------------------------------------------------
-- 3) Yedekleme kayıtları (Adım 1.11, K-040)
--    Günlük otomatik yedek (sunucu görevi) ve elle alınan yedekler burada
--    izlenir; dosyalar özel `backups` deposundadır.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_backups (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('AUTO', 'MANUAL', 'PRE_RESTORE')),
  status        TEXT NOT NULL CHECK (status IN ('OK', 'FAILED')),
  file_path     TEXT,
  size_bytes    BIGINT,
  row_counts    JSONB,
  error         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_backups_business ON business_backups(business_id, created_at DESC);

ALTER TABLE business_backups ENABLE ROW LEVEL SECURITY;

-- İşletme sahibi yedek kayıtlarını görür ve elle yedek kaydı ekleyebilir;
-- otomatik yedek kaydı sunucu görevi (servis anahtarı) tarafından yazılır.
CREATE POLICY business_backups_select ON business_backups
  FOR SELECT USING (business_id = public.current_business_id());
CREATE POLICY business_backups_insert ON business_backups
  FOR INSERT WITH CHECK (business_id = public.current_business_id() AND kind IN ('MANUAL', 'PRE_RESTORE'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 4) Hesaplama sürümü (Adım 1.9, AC-026): belgeyi hesaplayan ortak modülün
--    sürümü belgeyle birlikte saklanır; ileride yuvarlama kuralı değişirse
--    eski belgelerin hangi kuralla hesaplandığı bilinir.
-- ------------------------------------------------------------
ALTER TABLE sales     ADD COLUMN IF NOT EXISTS calc_version SMALLINT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS calc_version SMALLINT;
ALTER TABLE services  ADD COLUMN IF NOT EXISTS calc_version SMALLINT;
