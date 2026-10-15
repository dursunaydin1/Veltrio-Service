-- ============================================================
-- Migration: 001_initial_schema.sql
-- PRD §3, §4 — Temel tablolar: businesses, users, devices
-- ============================================================

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- BUSINESSES
-- ============================================================
CREATE TABLE businesses (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  owner_name            TEXT NOT NULL,
  phone                 TEXT,
  address               TEXT,
  tax_number            TEXT,
  logo_url              TEXT,
  device_code_prefix    TEXT NOT NULL CHECK (device_code_prefix ~ '^[A-Z0-9]{2,6}$'),
  settings              JSONB NOT NULL DEFAULT '{
    "default_tax_mode": "INCLUSIVE",
    "default_tax_rate": 20,
    "currency": "TRY",
    "service_approval_threshold": 0,
    "default_service_reminder_days": 1,
    "locale": "tr-TR"
  }',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_business_id ON users(business_id);

-- ============================================================
-- DEVICES
-- PRD §4.4: Her cihazın benzersiz device_code'u var
-- ============================================================
CREATE TABLE devices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_code     TEXT NOT NULL UNIQUE CHECK (device_code ~ '^[A-Z0-9]{2,6}-[A-Z0-9]{4}$'),
  device_name     TEXT NOT NULL,
  last_synced_at  TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_business_id ON devices(business_id);
CREATE INDEX idx_devices_device_code ON devices(device_code);

-- ============================================================
-- AUDIT LOGS
-- PRD §4.9: Değiştirilemez audit kaydı
-- ============================================================
CREATE TABLE audit_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_type         TEXT NOT NULL,
  entity_id           UUID NOT NULL,
  action              TEXT NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE','STATE_CHANGE','RESTORE')),
  old_value           JSONB,
  new_value           JSONB,
  changed_by_device   TEXT NOT NULL,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_business_id   ON audit_logs(business_id);
CREATE INDEX idx_audit_logs_entity        ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_changed_at    ON audit_logs(changed_at DESC);

-- Audit log UPDATE veya DELETE'e kapalı
CREATE RULE no_update_audit AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- PRD §12.1: business_id izolasyonu — AC-019
-- ============================================================
ALTER TABLE businesses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs  ENABLE ROW LEVEL SECURITY;

-- Kullanıcı kendi business'ına ait kayıtları görebilir
CREATE POLICY businesses_isolation ON businesses
  USING (id = (
    SELECT business_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY users_isolation ON users
  USING (business_id = (
    SELECT business_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY devices_isolation ON devices
  USING (business_id = (
    SELECT business_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY audit_logs_isolation ON audit_logs
  USING (business_id = (
    SELECT business_id FROM users WHERE id = auth.uid()
  ));

-- ============================================================
-- updated_at otomatik güncelleme trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
