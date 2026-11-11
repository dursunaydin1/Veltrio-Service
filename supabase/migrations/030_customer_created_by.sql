-- ============================================================
-- 030 · Müşteriyi kimin eklediği (K-121)
-- Satış, servis ve ödeme kayıtları cihaz koduyla imzalanıyordu; müşteri kaydı imzasızdı.
-- Patron, çalışanın eklediği müşteriyi bildirimde ve çalışanın "Yaptıkları" listesinde görür.
-- Eski kayıtlar boş kalır (kimin eklediği bilinmiyor). Uygulamanın yeni sürümü bu sütunu
-- gönderdiği için bu dosya, yeni sürüm yayına alınmadan önce çalıştırılmalıdır.
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_device TEXT;
