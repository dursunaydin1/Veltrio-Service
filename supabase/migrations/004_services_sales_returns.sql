-- ============================================================
-- Migration: 004_services.sql
-- PRD §5 — Servis tabloları (FAZ 3)
-- ============================================================

-- ============================================================
-- SERVICES
-- ============================================================
CREATE TABLE services (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  document_no           TEXT NOT NULL,
  customer_id           UUID REFERENCES customers(id) ON DELETE SET NULL,
  machine_id            UUID REFERENCES machines(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'WAITING_DIAGNOSIS' CHECK (status IN (
                          'WAITING_DIAGNOSIS','IN_PROGRESS','WAITING_PARTS',
                          'WAITING_CUSTOMER_APPROVAL','READY_FOR_DELIVERY',
                          'DELIVERED','CANCELLED'
                        )),
  description           TEXT,
  customer_complaint    TEXT,
  diagnosis             TEXT,
  resolution            TEXT,
  deposit_amount        DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  labor_fee             DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (labor_fee >= 0),
  total_amount          DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  promised_date         DATE,
  received_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_date        TIMESTAMPTZ,
  delivered_date        TIMESTAMPTZ,
  first_completed_at    TIMESTAMPTZ,   -- Yeniden açılsa bile ilk tamamlanma zamanı korunur
  warranty_until        DATE,
  is_warranty_claim     BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason         TEXT,
  created_by_device     TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_service_doc_no UNIQUE (business_id, document_no)
);

CREATE INDEX idx_services_business_id   ON services(business_id);
CREATE INDEX idx_services_customer_id   ON services(customer_id);
CREATE INDEX idx_services_machine_id    ON services(machine_id);
CREATE INDEX idx_services_status        ON services(business_id, status);
CREATE INDEX idx_services_promised_date ON services(promised_date);
CREATE INDEX idx_services_created_at    ON services(created_at DESC);

CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SERVICE PARTS
-- PRD §5.4: Servis parçaları, onay mekanizması, snapshot
-- ============================================================
CREATE TABLE service_parts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id            UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  product_id            UUID REFERENCES products(id) ON DELETE SET NULL,
  serial_unit_id        UUID REFERENCES product_serial_units(id) ON DELETE SET NULL,
  description_snapshot  TEXT NOT NULL,    -- Stoktan silinse bile kayıt bozulmaz
  quantity              DECIMAL(15,4) NOT NULL CHECK (quantity > 0),
  unit                  TEXT NOT NULL,
  unit_price_snapshot   DECIMAL(15,4) NOT NULL CHECK (unit_price_snapshot >= 0),
  unit_cost_snapshot    DECIMAL(15,4) NOT NULL DEFAULT 0,  -- AC-050
  status                TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
                          'PENDING','APPROVED','REJECTED','ARRIVED','USED'
                        )),
  stock_movement_id     UUID REFERENCES stock_movements(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  approved_amount       DECIMAL(15,4),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_parts_service  ON service_parts(service_id);
CREATE INDEX idx_service_parts_product  ON service_parts(product_id);
CREATE INDEX idx_service_parts_status   ON service_parts(service_id, status);

CREATE TRIGGER trg_service_parts_updated_at
  BEFORE UPDATE ON service_parts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SERVICE STATUS HISTORY
-- Durum geçiş geçmişi — PRD §5.3
-- ============================================================
CREATE TABLE service_status_history (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id          UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  from_status         TEXT,
  to_status           TEXT NOT NULL,
  changed_by_device   TEXT NOT NULL,
  note                TEXT,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_history_service ON service_status_history(service_id);

-- ============================================================
-- SALES (FAZ 4)
-- ============================================================
CREATE TABLE sales (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  document_no       TEXT NOT NULL,
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  sale_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subtotal          DECIMAL(15,4) NOT NULL DEFAULT 0,
  discount_total    DECIMAL(15,4) NOT NULL DEFAULT 0,
  tax_total         DECIMAL(15,4) NOT NULL DEFAULT 0,
  total_amount      DECIMAL(15,4) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINAL','CANCELLED')),
  cancel_reason     TEXT,
  created_by_device TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_sale_doc_no UNIQUE (business_id, document_no)
);

CREATE INDEX idx_sales_business_id ON sales(business_id);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);
CREATE INDEX idx_sales_status      ON sales(business_id, status);
CREATE INDEX idx_sales_date        ON sales(sale_date DESC);

CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SALE ITEMS
-- ============================================================
CREATE TABLE sale_items (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id               UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id            UUID REFERENCES products(id) ON DELETE SET NULL,
  serial_unit_id        UUID REFERENCES product_serial_units(id) ON DELETE SET NULL,
  machine_id            UUID REFERENCES machines(id) ON DELETE SET NULL,
  description_snapshot  TEXT NOT NULL,
  quantity              DECIMAL(15,4) NOT NULL CHECK (quantity > 0),
  unit                  TEXT NOT NULL,
  unit_price_snapshot   DECIMAL(15,4) NOT NULL CHECK (unit_price_snapshot >= 0),
  unit_cost_snapshot    DECIMAL(15,4) NOT NULL DEFAULT 0,
  discount_amount       DECIMAL(15,4) NOT NULL DEFAULT 0,
  tax_mode              TEXT NOT NULL DEFAULT 'INCLUSIVE'
                          CHECK (tax_mode IN ('INCLUSIVE','EXCLUSIVE','NONE')),
  tax_rate              DECIMAL(5,2) NOT NULL DEFAULT 0,
  line_total            DECIMAL(15,4) NOT NULL,
  stock_movement_id     UUID REFERENCES stock_movements(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

-- ============================================================
-- PURCHASES (FAZ 4)
-- ============================================================
CREATE TABLE purchases (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  document_no       TEXT NOT NULL,
  supplier_id       UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_amount      DECIMAL(15,4) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','RECEIVED','CANCELLED')),
  notes             TEXT,
  created_by_device TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_purchase_doc_no UNIQUE (business_id, document_no)
);

CREATE INDEX idx_purchases_business_id ON purchases(business_id);
CREATE INDEX idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX idx_purchases_status      ON purchases(business_id, status);
CREATE INDEX idx_purchases_date        ON purchases(purchase_date DESC);

CREATE TRIGGER trg_purchases_updated_at
  BEFORE UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PURCHASE ITEMS
-- ============================================================
CREATE TABLE purchase_items (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  purchase_id           UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id            UUID REFERENCES products(id) ON DELETE SET NULL,
  description_snapshot  TEXT NOT NULL,
  quantity              DECIMAL(15,4) NOT NULL CHECK (quantity > 0),
  unit                  TEXT NOT NULL,
  unit_price            DECIMAL(15,4) NOT NULL CHECK (unit_price >= 0),
  line_discount         DECIMAL(15,4) NOT NULL DEFAULT 0,
  tax_mode              TEXT NOT NULL DEFAULT 'INCLUSIVE'
                          CHECK (tax_mode IN ('INCLUSIVE','EXCLUSIVE','NONE')),
  tax_rate              DECIMAL(5,2) NOT NULL DEFAULT 0,
  line_total            DECIMAL(15,4) NOT NULL,
  stock_movement_id     UUID REFERENCES stock_movements(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_product  ON purchase_items(product_id);

-- ============================================================
-- RETURN TRANSACTIONS (FAZ 5)
-- ============================================================
CREATE TABLE return_transactions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  document_no         TEXT NOT NULL,
  original_type       TEXT NOT NULL CHECK (original_type IN ('SALE','PURCHASE','SERVICE')),
  original_id         UUID NOT NULL,
  return_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason              TEXT,
  refund_method       TEXT,
  total_amount        DECIMAL(15,4) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','REVERSED')),
  created_by_device   TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_return_doc_no UNIQUE (business_id, document_no)
);

CREATE INDEX idx_returns_business_id  ON return_transactions(business_id);
CREATE INDEX idx_returns_original     ON return_transactions(original_type, original_id);

-- ============================================================
-- RETURN ITEMS
-- ============================================================
CREATE TABLE return_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  return_id           UUID NOT NULL REFERENCES return_transactions(id) ON DELETE CASCADE,
  original_line_type  TEXT NOT NULL,
  original_line_id    UUID NOT NULL,
  product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
  serial_unit_id      UUID REFERENCES product_serial_units(id) ON DELETE SET NULL,
  quantity            DECIMAL(15,4) NOT NULL CHECK (quantity > 0),
  unit                TEXT NOT NULL,
  amount              DECIMAL(15,4) NOT NULL,
  stock_disposition   TEXT NOT NULL CHECK (stock_disposition IN ('SELLABLE','DAMAGED','NOT_RETURNED')),
  stock_movement_id   UUID REFERENCES stock_movements(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_return_items_return  ON return_items(return_id);
CREATE INDEX idx_return_items_product ON return_items(product_id);

-- ============================================================
-- NOTIFICATIONS
-- PRD §14
-- ============================================================
CREATE TABLE notifications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  related_record_id   UUID,
  message             TEXT NOT NULL,
  dedupe_key          TEXT NOT NULL,
  read_at             TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_notification_dedupe UNIQUE (business_id, dedupe_key)  -- AC-038
);

CREATE INDEX idx_notifications_business  ON notifications(business_id);
CREATE INDEX idx_notifications_unread    ON notifications(business_id, read_at) WHERE read_at IS NULL;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE services              ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_parts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'services','service_parts','service_status_history',
    'sales','sale_items','purchases','purchase_items',
    'return_transactions','return_items','notifications'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()))',
      tbl, tbl
    );
  END LOOP;
END $$;
