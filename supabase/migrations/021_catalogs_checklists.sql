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
