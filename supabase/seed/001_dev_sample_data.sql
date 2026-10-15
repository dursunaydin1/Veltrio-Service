-- ============================================================
-- Seed: 001_dev_sample_data.sql
-- Geliştirme ortamı için örnek veri
-- PRODUCTION'DA ÇALIŞTIRMA
-- ============================================================

-- Örnek işletme
INSERT INTO businesses (id, name, owner_name, phone, device_code_prefix, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Demo Tarım Servisi',
  'Demo Kullanıcı',
  '05321234567',
  'DEMO',
  '{
    "default_tax_mode": "INCLUSIVE",
    "default_tax_rate": 20,
    "currency": "TRY",
    "service_approval_threshold": 1000,
    "default_service_reminder_days": 1,
    "locale": "tr-TR"
  }'
);

-- Not: Gerçek kullanıcı kaydı Supabase Auth üzerinden yapılır.
-- Bu seed yalnızca businesses tablosuna örnek veri ekler.
