-- ============================================================
-- Migration: 020_due_dates.sql
-- FAZ 5 / ADIM 5.3 — Vade tarihi (K-034)
-- ============================================================

-- Vade tarihi, ödenmemiş alacağın bağlı olduğu belgededir (satış, servis): ödenmemiş
-- tutar henüz bir ödeme kaydı olmadığından vade Payment üzerinde tutulamaz.
-- Boşsa vade yoktur: hatırlatma üretilmez, yaşlandırma belge tarihine göre yapılır.
ALTER TABLE sales    ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS due_date DATE;

COMMENT ON COLUMN sales.due_date    IS 'Vade (YYYY-MM-DD); boşsa vade yok';
COMMENT ON COLUMN services.due_date IS 'Borçlu teslimde söz verilen ödeme tarihi; boşsa vade yok';
