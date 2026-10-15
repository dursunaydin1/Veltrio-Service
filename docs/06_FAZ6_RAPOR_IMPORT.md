# FAZ 6 — İçe/Dışa Aktarma & Raporlar

> PRD §20 Faz 6 | Önkoşul: FAZ 1-5 tamamlanmış olmalı

---

## Amaç

Excel/CSV ile veri aktarımını, kapsamlı raporları ve uygulama içi bildirim sistemini tamamlamak.

---

## Adım Adım İşlem Basamakları

### ADIM 6.1 — Excel/CSV İçe Aktarma Altyapısı

**Görevler:**
- [ ] İçe aktarma şablon dosyaları oluştur (indirilebilir .xlsx)
- [ ] Alan eşleştirme ekranı (hangi sütun neye karşılık geliyor)
- [ ] **İçe aktarma adımları:**
  1. Dosya yükleme
  2. Önizleme/doğrulama (hatalı satırlar raporlanır)
  3. Kullanıcı onayı
  4. Kayıtlara uygulama
- [ ] İçe aktarma her zaman çevrimiçi yapılır (sunucu doğrulaması gerekir)
- [ ] `ImportBatch` tablosu: id, business_id, file_name, file_hash, imported_at, row_count, error_count, status
- [ ] `file_hash` ile aynı dosyanın iki kez yüklenmesi engellenir (AC-047, TC-048)
- [ ] Tekrarlı yükleme koruması: aynı özet (file_hash) bulunursa kullanıcı uyarılır

**İlgili FR:** FR-016, FR-026  
**İlgili AC:** AC-015, AC-047

---

### ADIM 6.2 — Müşteri Listesi İçe Aktarma

**Görevler:**
- [ ] Sütunlar: ad, telefon, adres/köy, not
- [ ] Telefon normalizasyonu ile mükerrer uyarısı
- [ ] Kullanıcı eşleştirme, birleştirme veya ayrı kayıt seçeneği
- [ ] Hatalı satırlar raporda gösterilir; başarılı satırlar ayrı

---

### ADIM 6.3 — Ürün Listesi İçe Aktarma

**Görevler:**
- [ ] Sütunlar: ad, kod, kategori, birim, satış fiyatı, kritik stok seviyesi, varsayılan KDV
- [ ] Ürün kodu tekrarı uyarısı
- [ ] Mevcut ürünle eşleştirme seçeneği

---

### ADIM 6.4 — Açılış Stoğu İçe Aktarma

**Görevler:**
- [ ] Sütunlar: ürün, miktar, tarih, açıklama
- [ ] Her satır bir açılış StockMovement kaydı üretir (movement_type = OPENING)
- [ ] Açılış bakiyesi değişikliği kritik işlem onayı gerektirir
- [ ] ImportBatch'e bağlı

**İlgili AC:** AC-015  
**Test:** TC-017

---

### ADIM 6.5 — Müşteri & Tedarikçi Açılış Bakiyesi İçe Aktarma

**Görevler:**
- [ ] Sütunlar: taraf, yön (OWED_BY_PARTY / OWED_TO_PARTY), tutar, tarih, açıklama
- [ ] OpeningBalance kayıtları oluşturulur; sahte satış/ödeme yaratılmaz
- [ ] ImportBatch'e bağlı; aynı batch ikinci kez uygulanmaz

**İlgili AC:** AC-015, AC-047  
**Test:** TC-017, TC-048

---

### ADIM 6.6 — Bildirim Sistemi

**Görevler:**
- [ ] `Notification` tablosu: id, business_id, type, related_record_id, created_at, read_at, resolved_at, dedupe_key
- [ ] **Bildirim türleri ve tetikleyicileri:**

| Bildirim | Tetikleyici | Çözülme |
|----------|-------------|---------|
| Müşteri onayı bekleniyor | Servis durumu değiştiğinde | Müşteri kararı kaydedilince |
| Parça bekleniyor | Servis parça bekleniyor durumuna geçince | Tüm parçalar ARRIVED/IN_STOCK |
| Teslim tarihi hatırlatma | Varsayılan 1 gün önce; gecikince günde bir | Teslim edilince |
| Servis tamamlandı | İş tamamlandı durumuna ilk geçişte | — |
| Kritik stok | AVAILABLE stok critical_stock_level'e eşit/altına inince | Eşik üstüne çıkınca |
| Vade hatırlatma | Vade gününde + gecikme 7 günü aşınca | Bakiye kapanınca |
| Eşitleme sorunu | Eşitlenemeyen kayıt / çakışma kuyruğunda bekleyen | Çözülünce |

- [ ] `dedupe_key` ile cihaz başına tekrarlı bildirim engellenir
- [ ] Okundu/çözüldü bilgisi sunucuya eşitlenir; çevrimdışı okundu bilgisi bağlantı gelince eşitlenir
- [ ] Telefon anlık bildirimi ve WhatsApp MVP dışı; uygulama içi bildirimler

**İlgili FR:** FR-022  
**İlgili AC:** AC-028, AC-038  
**Test:** TC-029, TC-039

---

### ADIM 6.7 — Eşitleme, Yedek ve Bildirim Merkezi (UI)

**Görevler:**
- [ ] Tek ekranda:
  - Son başarılı eşitleme zamanı
  - Bekleyen ve hatalı kayıt sayısı
  - Çakışma kuyruğu listesi
  - Son yedek tarihi/durumu
  - Bildirim listesi (okundu/çözüldü işaretleme)
- [ ] Dışa aktarma başlatma düğmesi
- [ ] Geri yükleme başlatma düğmesi

**İlgili PRD:** §4.8

---

### ADIM 6.8 — XLSX/CSV Dışa Aktarma

**Görevler:**
- [ ] Dışa aktarma kimlik doğrulama gerektirir (AC-049)
- [ ] Hassas veri uyarısı gösterilir
- [ ] **Dışa aktarma hedefleri:**
  - Müşteri listesi
  - Ürün/stok listesi
  - Satış raporu (belirli tarih aralığı)
  - Tahsilat raporu
  - Servis geliri raporu
  - Müşteri bakiyeleri
  - Tedarikçi bakiyeleri
  - Stok hareketleri
- [ ] Türkçe karakter uyumluluğu (UTF-8 BOM veya Excel ayraç uyumluluğu)
- [ ] Tarih/tutar biçimleri Türkiye standardına uygun

**İlgili FR:** FR-026  
**İlgili AC:** AC-024, AC-049  
**Test:** TC-026, TC-050

---

### ADIM 6.9 — Satış Raporları

**Görevler:**
- [ ] **Günlük/Aylık Satış Raporu (§15):**
  - Satış belgelerinin belge tarihine göre brüt, indirim, iade, iptal, net satış toplamları
  - KDV dahil brüt tutar; vergi tutarı ayrı sütunda
- [ ] **Tahsilat Raporu:**
  - Fiilî ödeme hareketlerinin ödeme tarihine göre nakit/kart/banka/diğer ayrımı
  - Veresiye satış dahil edilmez
- [ ] Tarih filtreleri yerel Türkiye tarihine göre
- [ ] İade/iptal orijinal belgeyi silmez; ters kayıt olarak net toplamdan düşer

**İlgili AC:** AC-023  
**Test:** TC-025

---

### ADIM 6.10 — Servis Geliri Raporu

**Görevler:**
- [ ] Tamamlanan (first_completed_at dolu) ücretli servis kalemlerinin tahakkuk eden tutarı
- [ ] Tamamlanma tarihine göre (tahsilattan ayrı)
- [ ] Yeniden açılan servis ikinci kez sayılmaz
- [ ] İptal/iade düzeltmeleri ve iptalde alınan inceleme ücreti dahil

**Test:** TC-025

---

### ADIM 6.11 — Aktif Servisler Raporu

**Görevler:**
- [ ] Duruma, bekleme sebebine, vaat edilen teslim tarihine göre servis listesi
- [ ] Filtreleme: duruma göre, teslim tarihine göre
- [ ] Gecikmeli ve yaklaşan teslimler öne çıkar

---

### ADIM 6.12 — Müşteri & Tedarikçi Bakiye Raporları

**Görevler:**
- [ ] **Müşteri bakiyeleri raporu:** müşteri bazında bakiye + hareket dökümü + yaşlandırma bantları
- [ ] **Tedarikçi bakiyeleri raporu:** borç, ödemeler, iadeler, kalan borç

**İlgili AC:** AC-023

---

### ADIM 6.13 — Stok Raporu

**Görevler:**
- [ ] Anlık satılabilir ve hasarlı stok miktarları
- [ ] Kritik seviye kıyaslaması
- [ ] Ürün bazlı giriş/çıkış ve hareket kaynağı
- [ ] Stok hareket geçmişi detay görüntüleme

---

### ADIM 6.14 — Makine Geçmişi Raporu

**Görevler:**
- [ ] Makineye bağlı tamamlanmış servisler, tarih, işlem ve servis sayısı

---

## FAZ 6 Tamamlanma Kriterleri

| # | Kriter | AC/TC Referansı |
|---|--------|----------------|
| 1 | Aynı dosya iki kez içe aktarılamıyor | AC-047, TC-048 |
| 2 | Açılış stoku içe aktarıldığında OpeningBalance kayıtları oluşuyor | AC-015, TC-017 |
| 3 | Kritik stok bildirimi eşik altında bir kez oluşuyor | AC-028, TC-029 |
| 4 | Vade ve teslim hatırlatmaları doğru zamanda, tekrarsız görünüyor | AC-038, TC-039 |
| 5 | Satış, tahsilat ve servis geliri raporları ayrı hesaplanıyor | AC-023, TC-025 |
| 6 | CSV Türkçe karakter bozulmuyor | AC-024, TC-026 |
| 7 | Dışa aktarma kimlik doğrulama istiyor ve uyarı gösteriyor | AC-049, TC-050 |

---

## Sonraki Faz

[FAZ 7 — Sağlamlaştırma →](./07_FAZ7_SAGLAM.md)
