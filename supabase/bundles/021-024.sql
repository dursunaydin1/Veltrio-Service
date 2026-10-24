-- ============================================================
-- 021-024 birleşik (tek yapıştırmada çalıştırmak için).
-- Supabase → SQL Editor → New query → bu dosyanın tamamını yapıştırıp Run.
-- Her migration ayrı dosyada da vardır; ikisini birden çalıştırmayın.
-- ============================================================

-- >>>>>>>>>> 021_catalogs_checklists.sql
-- ============================================================
-- Migration: 021_catalogs_checklists.sql
-- FAZ 3 / ADIM 3.5, 3.10, 3.11 — Kataloglar, şablonlar, kontrol listesi, garanti (K-035)
-- ============================================================

-- İşlem kataloğu: servis kalemi eklerken hızlı seçim (önerilen fiyat, süre)
CREATE TABLE operation_catalog (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'Diğer',
  suggested_price   DECIMAL(15,4) CHECK (suggested_price >= 0),
  default_duration  INTEGER CHECK (default_duration >= 0),
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Arıza kataloğu: şikâyet girerken hızlı seçim
CREATE TABLE issue_catalog (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Diğer',
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Servis şablonları ve maddeleri
CREATE TABLE service_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  machine_type  TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_template_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  template_id  UUID NOT NULL REFERENCES service_templates(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  required     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_template_items_template ON service_template_items(template_id);

-- Servise kopyalanan kontrol listesi maddeleri: şablon değişse bile değişmez (AC-005)
CREATE TABLE service_checklist_items (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id            UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  template_item_id      UUID,
  title_snapshot        TEXT NOT NULL,
  required              BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  is_completed          BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at          TIMESTAMPTZ,
  completed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_by_device   TEXT,
  note                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_checklist_service ON service_checklist_items(service_id);

-- Garanti: kaynak ve kapsam açıklaması (is_warranty_claim zaten var)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS warranty_source    TEXT,
  ADD COLUMN IF NOT EXISTS warranty_coverage  TEXT;

-- Makine kartında garanti bitiş tarihi (bilgi amaçlı; kapsamı kullanıcı doğrular)
ALTER TABLE machines ADD COLUMN IF NOT EXISTS warranty_until DATE;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'operation_catalog',
    'issue_catalog',
    'service_templates',
    'service_template_items',
    'service_checklist_items'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_business ON public.%I(business_id)', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_version BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_record_version()', t, t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I USING (business_id = public.current_business_id()) WITH CHECK (business_id = public.current_business_id())',
      t || '_isolation', t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%I_sync_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_sync_change()',
      t, t
    );
  END LOOP;
END;
$$;

-- >>>>>>>>>> 022_photos.sql
-- ============================================================
-- Migration: 022_photos.sql
-- FAZ 2-3 — Fotoğraflar (FR-028, K-036)
-- ============================================================

-- İstemcide 1600 px'e küçültülmüş JPEG, data URL metni olarak saklanır.
-- Büyük hacimde Supabase Storage'a taşınması Faz 7'de değerlendirilir.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS photo TEXT;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS photo TEXT;
ALTER TABLE services  ADD COLUMN IF NOT EXISTS intake_photo TEXT;

COMMENT ON COLUMN customers.photo      IS 'İsteğe bağlı müşteri fotoğrafı (JPEG data URL, ≤1600px)';
COMMENT ON COLUMN products.photo       IS 'İsteğe bağlı ürün fotoğrafı (JPEG data URL, ≤1600px)';
COMMENT ON COLUMN services.intake_photo IS 'İsteğe bağlı kabul fotoğrafı (JPEG data URL, ≤1600px)';

-- >>>>>>>>>> 023_cancel_fee.sql
-- ============================================================
-- Migration: 023_cancel_fee.sql
-- FAZ 3 / ADIM 3.13 — İptal edilen serviste inceleme / teşhis ücreti (K-037)
-- ============================================================

-- İptal edilen servis normalde müşteriye yazılmaz. İnceleme / teşhis ücreti
-- alınacaksa tutar burada tutulur: servis iptal olarak kalır, sayaç artmaz,
-- ücret müşteri bakiyesine ve servis bakiyesine yazılır.
ALTER TABLE services ADD COLUMN IF NOT EXISTS cancel_fee DECIMAL(15,4) CHECK (cancel_fee >= 0);

COMMENT ON COLUMN services.cancel_fee IS 'İptal edilen serviste alınan inceleme/teşhis ücreti; boşsa ücret yok';

-- >>>>>>>>>> 024_account_setup_devices.sql
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
