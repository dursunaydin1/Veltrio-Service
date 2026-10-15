-- ============================================================
-- Migration: 003_products_stock.sql
-- PRD §7 — Ürün kataloğu, seri takip, stok hareketleri
-- ============================================================

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE products (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  code                  TEXT,
  category              TEXT,
  unit                  TEXT NOT NULL DEFAULT 'ADET',
  is_serial_tracked     BOOLEAN NOT NULL DEFAULT FALSE,
  default_sale_price    DECIMAL(15,4) NOT NULL DEFAULT 0 CHECK (default_sale_price >= 0),
  last_purchase_price   DECIMAL(15,4),
  default_tax_mode      TEXT NOT NULL DEFAULT 'INCLUSIVE'
                          CHECK (default_tax_mode IN ('INCLUSIVE','EXCLUSIVE','NONE')),
  default_tax_rate      DECIMAL(5,2) NOT NULL DEFAULT 20
                          CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100),
  critical_stock_level  DECIMAL(15,4),
  stock_available       DECIMAL(15,4) NOT NULL DEFAULT 0,  -- Satılabilir stok
  stock_damaged         DECIMAL(15,4) NOT NULL DEFAULT 0,  -- Hasarlı stok
  archived_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_product_code UNIQUE (business_id, code)
);

CREATE INDEX idx_products_business_id ON products(business_id);
CREATE INDEX idx_products_category    ON products(business_id, category);
CREATE INDEX idx_products_archived    ON products(business_id, archived_at);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PRODUCT SERIAL UNITS
-- PRD §7.2: Seri takipli ürünlerde birim bazlı kayıt
-- ============================================================
CREATE TABLE product_serial_units (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  serial_number   TEXT,
  status          TEXT NOT NULL DEFAULT 'IN_STOCK'
                    CHECK (status IN ('IN_STOCK','SOLD','DAMAGED','RETURNED')),
  machine_id      UUID REFERENCES machines(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_serial_units_product    ON product_serial_units(product_id);
CREATE INDEX idx_serial_units_status     ON product_serial_units(business_id, status);
CREATE INDEX idx_serial_units_machine    ON product_serial_units(machine_id);
-- Seri no aynı işletme ve ürün içinde benzersiz olmalı (null hariç)
CREATE UNIQUE INDEX uq_serial_unit_number
  ON product_serial_units(business_id, product_id, serial_number)
  WHERE serial_number IS NOT NULL;

CREATE TRIGGER trg_serial_units_updated_at
  BEFORE UPDATE ON product_serial_units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- STOCK MOVEMENTS
-- PRD §7.4: Append-only stok hareketleri
-- ============================================================
CREATE TABLE stock_movements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  serial_unit_id    UUID REFERENCES product_serial_units(id) ON DELETE SET NULL,
  movement_type     TEXT NOT NULL CHECK (movement_type IN (
                      'OPENING','PURCHASE_IN','SALE_OUT','SERVICE_USE',
                      'RETURN_IN','RETURN_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT',
                      'DAMAGED_IN','DAMAGED_DISPOSE','TRANSFER'
                    )),
  quantity          DECIMAL(15,4) NOT NULL,  -- + giriş, - çıkış
  unit_cost         DECIMAL(15,4),
  source_type       TEXT,   -- 'SERVICE' | 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | ...
  source_id         UUID,
  note              TEXT,
  created_by_device TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_business    ON stock_movements(business_id);
CREATE INDEX idx_stock_movements_product     ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_source      ON stock_movements(source_type, source_id);
CREATE INDEX idx_stock_movements_created_at  ON stock_movements(created_at DESC);

-- Stock movements immutable: hiçbir zaman güncellenmez veya silinmez
CREATE RULE no_update_stock_movements AS ON UPDATE TO stock_movements DO INSTEAD NOTHING;
CREATE RULE no_delete_stock_movements AS ON DELETE TO stock_movements DO INSTEAD NOTHING;

-- ============================================================
-- PAYMENTS
-- PRD §9.4
-- ============================================================
CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  direction           TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  method              TEXT NOT NULL CHECK (method IN ('CASH','CARD','BANK_TRANSFER','OTHER')),
  amount              DECIMAL(15,4) NOT NULL CHECK (amount > 0),
  payment_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
  supplier_id         UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  source_type         TEXT,
  source_id           UUID,
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID','REVERSED')),
  reversal_of_id      UUID REFERENCES payments(id) ON DELETE SET NULL,
  created_by_device   TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_business      ON payments(business_id);
CREATE INDEX idx_payments_customer      ON payments(customer_id);
CREATE INDEX idx_payments_supplier      ON payments(supplier_id);
CREATE INDEX idx_payments_source        ON payments(source_type, source_id);
CREATE INDEX idx_payments_date          ON payments(payment_date DESC);
CREATE INDEX idx_payments_status        ON payments(business_id, status);

-- ============================================================
-- PAYMENT ALLOCATIONS
-- PRD §9.4: Hangi ödeme hangi belgeye tahsis edildi
-- ============================================================
CREATE TABLE payment_allocations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  payment_id        UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL,
  source_id         UUID NOT NULL,
  allocated_amount  DECIMAL(15,4) NOT NULL CHECK (allocated_amount > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_alloc_payment ON payment_allocations(payment_id);
CREATE INDEX idx_payment_alloc_source  ON payment_allocations(source_type, source_id);

-- ============================================================
-- IMPORT BATCHES
-- PRD §16: İçe aktarma grupları, tekrar yükleme koruması
-- ============================================================
CREATE TABLE import_batches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  file_hash     TEXT NOT NULL,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_count     INTEGER NOT NULL DEFAULT 0,
  error_count   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','COMPLETED','FAILED')),

  CONSTRAINT uq_import_batch_hash UNIQUE (business_id, file_hash)  -- AC-047
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_serial_units  ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches        ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_isolation             ON products              USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));
CREATE POLICY serial_units_isolation         ON product_serial_units  USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));
CREATE POLICY stock_movements_isolation      ON stock_movements        USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));
CREATE POLICY payments_isolation             ON payments               USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));
CREATE POLICY payment_allocations_isolation  ON payment_allocations    USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));
CREATE POLICY import_batches_isolation       ON import_batches         USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));
