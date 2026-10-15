-- ============================================================
-- Migration: 002_customers_machines_suppliers.sql
-- PRD §4.5, §4.6 — Müşteri, Makine, Tedarikçi tabloları
-- ============================================================

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  phone             TEXT,
  phone_normalized  TEXT,          -- Arama ve mükerrer tespiti için
  village           TEXT,
  address           TEXT,
  notes             TEXT,
  archived_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_business_id     ON customers(business_id);
CREATE INDEX idx_customers_phone_norm      ON customers(business_id, phone_normalized);
CREATE INDEX idx_customers_archived        ON customers(business_id, archived_at);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- MACHINES
-- ============================================================
CREATE TABLE machines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  type            TEXT NOT NULL,
  brand           TEXT,
  model           TEXT,
  serial_number   TEXT,
  year            SMALLINT,
  is_temporary    BOOLEAN NOT NULL DEFAULT FALSE,
  merged_into_id  UUID REFERENCES machines(id) ON DELETE SET NULL,
  qr_code         TEXT UNIQUE,
  notes           TEXT,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_machines_business_id   ON machines(business_id);
CREATE INDEX idx_machines_customer_id   ON machines(customer_id);
CREATE INDEX idx_machines_serial        ON machines(business_id, serial_number);
CREATE INDEX idx_machines_qr            ON machines(qr_code);
CREATE INDEX idx_machines_archived      ON machines(business_id, archived_at);

CREATE TRIGGER trg_machines_updated_at
  BEFORE UPDATE ON machines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE suppliers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  address       TEXT,
  notes         TEXT,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_business_id ON suppliers(business_id);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- OPENING BALANCES
-- PRD §9.4: Sahte satış/ödeme yerine açılış bakiyesi kaydı
-- ============================================================
CREATE TABLE opening_balances (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  party_type      TEXT NOT NULL CHECK (party_type IN ('CUSTOMER','SUPPLIER')),
  party_id        UUID NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('OWED_BY_PARTY','OWED_TO_PARTY')),
  amount          DECIMAL(15,4) NOT NULL CHECK (amount >= 0),
  as_of_date      DATE NOT NULL,
  source_note     TEXT,
  import_batch_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opening_balances_party ON opening_balances(business_id, party_type, party_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE customers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balances  ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_isolation ON customers
  USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY machines_isolation ON machines
  USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY suppliers_isolation ON suppliers
  USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY opening_balances_isolation ON opening_balances
  USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));
