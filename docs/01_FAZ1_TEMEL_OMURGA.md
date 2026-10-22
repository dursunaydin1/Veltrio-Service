# FAZ 1 — Temel Omurga

> PRD §20 Faz 1 | Önkoşul: Yok | Bu fazın çıktısı FAZ 2'nin temelini kurar.

---

## Amaç

Bu faz tüm diğer modüllerin üzerine inşa edileceği teknik temeli oluşturur:
- Kimlik doğrulama ve cihaz yönetimi
- UUID ve belge numarası üretimi
- Eşitleme altyapısı (idempotency, append-only, çakışma kuyruğu)
- Audit log mekanizması
- Ortak hesaplama modülü iskeleti
- Global arama altyapısı
- Günlük yedekleme

---

## Adım Adım İşlem Basamakları

### ADIM 1.1 — Proje Yapısının Kurulumu

**Görevler:**
- [ ] Teknoloji yığını kararlarını ver (Frontend + Backend + DB)
- [ ] Monorepo veya ayrı repo yapısı belirle
- [ ] `apps/web` (PWA), `apps/api` (backend), `packages/shared` (ortak modüller) klasörlerini oluştur
- [ ] Linting, formatting (ESLint/Prettier veya Biome) ayarla
- [ ] Git repo başlat, `.gitignore` hazırla
- [ ] Ortam değişkenleri şablonu (`.env.example`) oluştur

**Kabul kriteri:**
- Proje çalışır boş iskelet ortaya çıktı; `npm run dev` çalışıyor.

---

### ADIM 1.2 — Veritabanı Şeması Kurulumu

**Görevler:**
- [ ] ORM veya migration aracı seç (Prisma / Drizzle / Knex)
- [ ] Aşağıdaki tabloları oluştur:
  - `Business` (id, name, phone, address, logo_ref, currency, timezone, created_at)
  - `User` (id, business_id, login, email, password_hash, status, role, recovery_channel)
  - `Device` (id, business_id, user_id, device_uuid, device_code, platform, last_sync_at, revoked_at, wipe_confirmed_at, local_key_metadata)
  - `BusinessSettings` (business_id, tüm ayar alanları)
  - `AuditLog` (id, business_id, actor_id, device_id, entity_type, entity_id, action, before_snapshot, after_snapshot, reason, occurred_at)
  - `SyncMetadata` (business_id, device_id, last_successful_sync, pending_count, failed_count, last_error)
- [ ] Her tabloya `created_at`, `updated_at`, `version`, `sync_state` alanlarını ekle
- [ ] business_id bazlı indexler kur
- [ ] Migration dosyalarını oluştur ve çalıştır

**Kabul kriteri:**
- `SELECT 1` gibi temel sorgular çalışıyor; migration dosyaları versiyon kontrolünde.

---

### ADIM 1.3 — Kimlik Doğrulama Sistemi

**Görevler:**
- [ ] Hesap/şifre ile kayıt ve giriş endpoint'leri yaz
- [ ] Parola hash'leme (bcrypt/argon2) uygula
- [ ] JWT veya session token yönetimi kur (refresh token dahil)
- [ ] E-posta doğrulama akışı (hesap kurtarma için gerekli)
- [ ] Hesap kurtarma e-posta akışı
- [ ] E-posta girilmeden kurulumda uyarı mesajı (AC-048)
- [ ] Şifre politikası (modern asgari koşullar)
- [ ] Oturum yenileme güvenli standartlara uygun

**İlgili FR:** FR-001, AC-020, AC-048  
**İlgili NFR:** NFR-009

**Kabul kriteri:**
- Kullanıcı kayıt olabilir, giriş yapabilir, token yenileyebilir, şifresini kurtarabilir.

---

### ADIM 1.4 — İlk Kurulum Sihirbazı

**Görevler:**
- [ ] İlk kurulum adımlarını tanımla: işletme adı, telefon, adres, e-posta, para birimi, vergi varsayılanı
- [x] Sunucu tarafında cihaz kodu otomatik ataması yap (kullanıcı girmez) — `register_device` (migration 007) + "Bu cihazı kaydet" ekranı
- [ ] İlk kurulum mutlaka çevrimiçi yapılır — çevrimdışı kurulumu engelle
- [ ] `BusinessSettings` varsayılan değerleri kaydet:
  - approval_threshold: 1.000 ₺
  - allow_negative_stock: false
  - delivery_reminder_days: 1
  - max_offline_days: 30

**İlgili FR:** FR-002  

**Kabul kriteri:**
- Kurulum sihirbazı tamamlandığında Business, User, Device kayıtları ve BusinessSettings oluşur.

---

### ADIM 1.5 — Cihaz PIN ve Cihaz Yönetimi

**Görevler:**
- [ ] Cihaz PIN belirleme ve güncelleme
- [ ] PIN ile hızlı giriş (token yenileme)
- [ ] 5 hatalı denemede geçici kilit + artan bekleme süresi
- [ ] Hesap ayarından cihaz listesi görüntüleme
- [ ] Cihaz iptali (Device.revoked_at) — çevrimiçi gerektirir
- [ ] İptal edilen cihazın bağlandığında yerel verisini silmesi (wipe_confirmed_at)

**İlgili FR:** FR-001, FR-023  
**İlgili AC:** AC-020, AC-045

**Kabul kriteri:**
- PIN 5 hatalı denemede kilitlenir; iptal edilen cihaz bağlandığında veriyi siler.

---

### ADIM 1.6 — UUID ve Belge Numarası Sistemi

**Görevler:**
- [x] UUID v4 üretim fonksiyonu (istemci tarafında, sunucudan bağımsız)
- [x] Belge numarası formatlarını kodla:
  - Servis: `S-[cihaz_kodu]-[yıl]-[sıra]`
  - Satış: `SAT-[cihaz_kodu]-[yıl]-[sıra]`
  - Satın alma: `AL-[cihaz_kodu]-[yıl]-[sıra]`
  - İade: `IAD-[cihaz_kodu]-[yıl]-[sıra]`
  - Makine iç numarası: `MK-[cihaz_kodu]-[sıra]`
  - Ürün seri birimi: `SB-[cihaz_kodu]-[sıra]`
- [x] Çevrimdışı sıra sayacı (cihaz bazlı, kalıcı yerel depolama)
- [ ] Sunucu tarafında numara çakışması tespiti ve yeniden numaralama + AuditLog

> `formatDocumentNo` (`utils/id.ts`) ve `nextDocumentNo` (`src/lib/numbering.ts`, Dexie `counters` tablosu, şema v2). Sunucuda numara çakışması tespiti ve yeniden numaralama henüz yok; şimdilik yalnızca `UNIQUE (business_id, document_no)` kısıtı çakışmayı reddediyor.

**İlgili PRD:** §7.3  
**İlgili AC:** AC-016

**Kabul kriteri:**
- İki cihaz çevrimdışı belge ürettiğinde UUID çakışmaz; numara çakışması olursa audit log'a yazılır.

---

### ADIM 1.7 — Eşitleme Altyapısı İskeleti

**Görevler:**
- [x] Eşitleme durumu: `sync_queue.status` = `PENDING | SYNCED | CONFLICT | ERROR` (kayıt başına ayrı `sync_state` sütunu açılmadı, bkz. K-009)
- [x] `version` (integer revision counter): sunucuda tetikleyiciyle artar (006), pull ile cihaza gelir, push'ta çakışma tespitinde kullanılır
- [x] İstemci tarafı eşitleme kuyruğu (yerel DB'de bekleyen kayıtlar)
- [x] Sunucu tarafı eşitleme endpoint'i (`POST /api/sync/push`, `GET /api/sync/pull`)
- [x] **Idempotency:** Aynı UUID ile gelen ekleme tekrarlandığında ikinci kayıt oluşmaz
- [x] **Append-only:** Stok/ödeme hareketlerinde yalnızca ekleme kabul edilir
- [ ] Bağımlılık sırası: üst kayıt önce eşitlenir (Customer → Machine → ServiceOrder → ...)
- [x] Hata kuyruğu: başarısız eşitleme kaydı silinmez, yeniden deneme kuyruğunda kalır
- [x] Çakışma kuyruğu iskeleti: sürüm farkı `CONFLICT` olarak kuyrukta bekler (`applyPushItem`); çözüm ekranı sonraki fazlarda
- [ ] `SyncMetadata` güncelleme
- [ ] Çevrimdışı azami gün kontrolü: 30 günü aşarsa yeni kayıt için çevrimiçi doğrulama

> Çakışma tespiti `src/lib/sync/apply.ts` içinde: ekleme idempotent (tekrar gelen ekleme güncel kaydı ezmez), güncelleme yalnızca `version` eşleşirse uygulanır (K-010). Migration 006 Supabase'e uygulandı.
>
> Push/pull API'si ve artımlı değişiklik günlüğü eklendi. Aktif cihaz doğrulaması yapılır; veritabanı tarafındaki `005_sync_changes.sql` migration'ı uygulanmalıdır. Bağımlılık sıralaması, çakışma çözüm ekranı, `SyncMetadata` ve uzun süre çevrimdışı kalma kuralı henüz tamamlanmadığından adım bütünüyle bitmiş sayılmaz.

**İlgili FR:** FR-020, FR-021  
**İlgili AC:** AC-036, AC-037

**Kabul kriteri:**
- Aynı eşitleme paketi iki kez gönderildiğinde sunucuda bir kayıt oluşur.
- Eşitleme hatası kaydı silmez; kuyrukta kalır.

---

### ADIM 1.8 — Audit Log Mekanizması

**Görevler:**
- [x] `AuditLog` tablosu şeması (PRD §7)
- [x] Audit log yazma yardımcı fonksiyonu (entity_type, entity_id, action, before/after snapshot, reason, actor, device)
- [ ] Hangi işlemlerin audit log'a yazılacağını listele:
  - Kritik işlemler: iade, satış/servis iptali, stok düzeltme, kayıt arşivleme, açılış bakiyesi değişikliği, cihaz iptali, veri dışa aktarma, yedekten geri yükleme
  - Makine sahipliği değişikliği
  - Belge numarası çakışması + yeniden numaralama
  - Kullanıcı kayıt/giriş/şifre değişimi
- [ ] Audit log'u okuyan "geçmiş" ekranı iskeleti

> Tablo (001 + 006: `actor_id`, `reason`), `writeAuditLog` (yerel kayıt + eşitleme kuyruğu, `src/lib/sync/audit.ts`) ve sunucu eşitlemesi hazır. Açık: hangi işlemlerin loglanacağının kod tarafında uygulanması (her özellik kendi işlemini loglar) ve geçmiş ekranı.

**İlgili PRD:** §2, §7  
**İlgili AC:** AC-032

**Kabul kriteri:**
- Kritik bir kayıt düzeltildiğinde eski/yeni değer, tarih, aktör ve gerekçe görüntülenebilir.

---

### ADIM 1.9 — Ortak Hesaplama Modülü İskeleti

**Görevler:**
- [x] `packages/shared/src/calc.ts` (veya eşdeğer) dosyası oluştur
- [x] Temel para işlemleri (decimal, yuvarlama, 2 ondalık basamak)
- [x] Satır toplamı hesaplama fonksiyonu: `(birim_fiyat - indirim) * miktar ± vergi`
- [x] KDV modları: `INCLUSIVE | EXCLUSIVE | NONE`
- [x] Belge toplamı = yuvarlanmış satır toplamlarının toplamı
- [ ] İstemci ve sunucu **aynı modülü** kullanır
- [ ] Hesaplama versiyonu belgeyle birlikte saklanır

> `src/lib/calc.ts` (kuruş cinsinden tam sayı, 20 testli). Sunucu push API'si henüz toplamları bu modülle doğrulamıyor; hesaplama versiyonu (`CALC_VERSION`) belgeyle birlikte henüz saklanmıyor. Bu iki madde açık.

**İlgili PRD:** §7.2, §9.2  
**İlgili AC:** AC-026

**Kabul kriteri:**
- İstemci ve sunucuda aynı girdi için aynı sonuç üretilir.

---

### ADIM 1.10 — Global Arama Altyapısı

**Görevler:**
- [ ] Arama endpoint'i: müşteri adı/telefon, makine no/seri no, servis no, ürün adı/kodu, satış no, tedarikçi
- [ ] Sonuçlar türüne göre etiketlenir
- [ ] Arşivlenen kayıtlar varsayılan olarak hariç; "arşivde de ara" seçeneği
- [ ] Çevrimdışı arama: yalnızca yerel kayıtlar, kapsam uyarısı gösterilir
- [ ] Telefon normalizasyonu (boşluk/tire/parantez temizleme, +90/0 birleştirme)

**İlgili FR:** FR-024  
**İlgili AC:** AC-022

---

### ADIM 1.11 — Günlük Yedekleme Altyapısı

**Görevler:**
- [ ] Sunucu taraflı günlük otomatik yedekleme job'u
- [ ] Yedekleme durumu ve zamanını `BusinessSettings` veya ayrı tabloda sakla
- [ ] Son yedek tarihi/durumu kullanıcıya görünür (Bölüm 4.8)
- [ ] Yedekleme/geri yükleme audit log'a yazılır
- [ ] Geri yükleme öncesi ek yedek alınır

**İlgili FR:** FR-023  
**İlgili NFR:** NFR-006, NFR-012

---

### ADIM 1.12 — Temel UI İskeleti (Mobil Öncelikli)

**Görevler:**
- [x] Ana ekran düzeni: hızlı eylemler (Yeni Servis, Yeni Satış, Ara, QR Tara), Bugünün Durumu alanı
- [x] Alt gezinme: Ana Sayfa, Servisler, Satışlar, Stok, Müşteriler
- [ ] İkincil menü: Tedarikçiler, Raporlar, Ayarlar, Yedekleme, Yardım
- [x] Eşitleme durumu göstergesi (her zaman görünür: bekleyen kayıt sayısı, son başarılı eşitleme)
- [x] Türkçe, TL, Türkiye tarih biçimi varsayılan
- [ ] Erişilebilirlik: yeterli kontrast, büyük dokunma hedefleri, klavye erişimi

> Uygulandı: `src/components/layout/` (AppShell, BottomNav, SyncStatus, QuickActions, TodayStatus), `(app)/layout.tsx`, `/more` menüsü (çıkış yap dahil). Henüz olmayan bölümler `ComingSoon` sayfasıyla açılır (K-011). Açık: Ara ve QR Tara (devre dışı), ikincil menüde Yedekleme ve Yardım, erişilebilirlik denetimi (skip-link, 44px hedefler, odak çerçevesi var; kontrast ve klavye denetimi Faz 7).

**İlgili PRD:** §3, §4.7  
**İlgili NFR:** NFR-001, NFR-007, NFR-013

---

## FAZ 1 Tamamlanma Kriterleri (Tümü Geçmeli)

| # | Kriter | AC/TC Referansı |
|---|--------|----------------|
| 1 | Kullanıcı kayıt, giriş, PIN ve hesap kurtarma çalışıyor | AC-020, AC-048 |
| 2 | Cihaz kodu sunucu tarafından atanıyor | FR-002 |
| 3 | PIN 5 hatalı denemede kilitleniyor | AC-020 |
| 4 | İptal edilen cihaz bağlandığında veriyi siliyor | AC-045 |
| 5 | İki cihaz çevrimdışı belge ürettiğinde UUID çakışmıyor | AC-016 |
| 6 | Aynı eşitleme paketi tekrar gönderildiğinde kopya oluşmuyor | AC-036 |
| 7 | Eşitleme hatasında kayıt silinmiyor | AC-037 |
| 8 | Kritik işlem audit log'a yazılıyor | AC-032 |
| 9 | İstemci ve sunucu hesaplama modülü aynı sonucu veriyor | AC-026 |
| 10 | Günlük yedek çalışıyor; son yedek tarihi görünür | NFR-006 |

---

## Sonraki Faz

[FAZ 2 — Stok & Ödeme Çekirdeği →](./02_FAZ2_STOK_ODEME.md)
