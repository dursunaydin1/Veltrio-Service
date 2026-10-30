-- ============================================================
-- 025 · İstemci hata kaydı (K-053)
-- Canlıda telefonda oluşan beklenmeyen hatalar buraya yazılır; geliştirici
-- Supabase panelinden okur. Eşitlenmez (sync_changes tetikleyicisi yok), yalnızca eklenir.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_errors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL DEFAULT auth.uid(),
  device_code  TEXT,
  message      TEXT NOT NULL CHECK (char_length(message) <= 2000),
  stack        TEXT CHECK (char_length(stack) <= 8000),
  digest       TEXT,
  url          TEXT CHECK (char_length(url) <= 1000),
  user_agent   TEXT CHECK (char_length(user_agent) <= 500),
  app_version  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_errors_created_idx ON client_errors (created_at DESC);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

-- Oturum açmış kullanıcı yalnızca kendi adına ve kendi işletmesi için ekleyebilir
CREATE POLICY client_errors_insert ON client_errors
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR business_id = (SELECT business_id FROM users WHERE id = auth.uid()))
  );

-- Kendi işletmesinin kayıtlarını okuyabilir; güncelleme ve silme yok
CREATE POLICY client_errors_select ON client_errors
  FOR SELECT TO authenticated
  USING (business_id = (SELECT business_id FROM users WHERE id = auth.uid()));
