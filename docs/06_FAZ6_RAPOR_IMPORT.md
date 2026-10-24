# FAZ 6 — İçe/Dışa Aktarma & Raporlar

> PRD §20 Faz 6 | Önkoşul: FAZ 1-5 tamamlanmış olmalı

---

## Amaç

Excel/CSV ile veri aktarımını, kapsamlı raporları ve uygulama içi bildirim sistemini tamamlamak.

---

## Adım Adım İşlem Basamakları

### ADIM 6.1 — Excel/CSV İçe Aktarma Altyapısı

**Görevler:**
- [x] İçe aktarma şablon dosyaları oluştur (indirilebilir .xlsx)
- [x] Alan eşleştirme ekranı (hangi sütun neye karşılık geliyor)
- [x] **İçe aktarma adımları:**
  1. Dosya yükleme
  2. Önizleme/doğrulama (hatalı satırlar raporlanır)
  3. Kullanıcı onayı
  4. Kayıtlara uygulama
- [x] İçe aktarma her zaman çevrimiçi yapılır (sunucu doğrulaması gerekir)
- [x] `ImportBatch` tablosu: id, business_id, file_name, file_hash, imported_at, row_count, error_count, status
- [x] `file_hash` ile aynı dosyanın iki kez yüklenmesi engellenir (AC-047, TC-048)
- [x] Tekrarlı yükleme koruması: aynı özet (file_hash) bulunursa kullanıcı uyarılır

> Uygulandı: `lib/import/*` (`parse.ts`: CSV UTF-8/BOM/Windows-1254 ve XLSX, `definitions.ts`: şablonlar ve alan eşleştirme, `validate.ts`, `apply.ts`) ve `/reports/import` sihirbazı: şablon indirme → dosya → alan eşleştirme → önizleme/doğrulama (hatalı satırlar nedenleriyle) → onay → tek işlemde uygulama. Çevrimiçi zorunlu; dosya SHA-256 özetiyle yerelde ve sunucuda (`UNIQUE (business_id, file_hash)`) mükerrer yükleme engellenir (AC-047). Her içe aktarma bir `ImportBatch` kaydıdır (K-041).

**İlgili FR:** FR-016, FR-026  
**İlgili AC:** AC-015, AC-047

---

### ADIM 6.2 — Müşteri Listesi İçe Aktarma

**Görevler:**
- [x] Sütunlar: ad, telefon, adres/köy, not
- [x] Telefon normalizasyonu ile mükerrer uyarısı
- [x] Kullanıcı eşleştirme, birleştirme veya ayrı kayıt seçeneği
- [x] Hatalı satırlar raporda gösterilir; başarılı satırlar ayrı

> Uygulandı: telefon normalizasyonuyla mükerrer (kayıtlı müşteri ve dosya içi) uyarısı; seçenekler: mevcutla eşleştir (atla), birleştir (yalnızca boş alanları doldur), ayrı kayıt aç. Adres/köy boşsa “Belirtilmedi” yazılır ve uyarılır.

---

### ADIM 6.3 — Ürün Listesi İçe Aktarma

**Görevler:**
- [x] Sütunlar: ad, kod, kategori, birim, satış fiyatı, kritik stok seviyesi, varsayılan KDV
- [x] Ürün kodu tekrarı uyarısı
- [x] Mevcut ürünle eşleştirme seçeneği

> Uygulandı: birim eşleme (adet, litre, kg, metre, kutu, takım, paket, rulo), fiyat/kritik stok/KDV okuma; kod tekrarı (kayıtlı veya dosya içi) uyarılır, aynı kodla ikinci ürün açılamaz; işletme KDV varsayılanı uygulanır.

---

### ADIM 6.4 — Açılış Stoğu İçe Aktarma

**Görevler:**
- [x] Sütunlar: ürün, miktar, tarih, açıklama
- [x] Her satır bir açılış StockMovement kaydı üretir (movement_type = OPENING)
- [x] Açılış bakiyesi değişikliği kritik işlem onayı gerektirir
- [x] ImportBatch'e bağlı

> Uygulandı: her satır `OPENING` stok hareketidir (`source_type = IMPORT`, `source_id` = ImportBatch); ürün ad/koduyla eşleşir; bulunamayan veya seri takipli ürün hata sayılır.

**İlgili AC:** AC-015  
**Test:** TC-017

---

### ADIM 6.5 — Müşteri & Tedarikçi Açılış Bakiyesi İçe Aktarma

**Görevler:**
- [x] Sütunlar: taraf, yön (OWED_BY_PARTY / OWED_TO_PARTY), tutar, tarih, açıklama
- [x] OpeningBalance kayıtları oluşturulur; sahte satış/ödeme yaratılmaz
- [x] ImportBatch'e bağlı; aynı batch ikinci kez uygulanmaz

> Uygulandı: `OpeningBalance` kayıtları (sahte satış/ödeme yok), `import_batch_id` bağlı; tarafta zaten açılış bakiyesi varsa varsayılan “atla”, “değiştir” seçilirse neden “içe aktarma” olarak audit log'a yazılır (kritik işlem).

**İlgili AC:** AC-015, AC-047  
**Test:** TC-017, TC-048

---

### ADIM 6.6 — Bildirim Sistemi

**Görevler:**
- [x] `Notification` tablosu: id, business_id, type, related_record_id, created_at, read_at, resolved_at, dedupe_key
- [x] **Bildirim türleri ve tetikleyicileri:**

| Bildirim | Tetikleyici | Çözülme |
|----------|-------------|---------|
| Müşteri onayı bekleniyor | Servis durumu değiştiğinde | Müşteri kararı kaydedilince |
| Parça bekleniyor | Servis parça bekleniyor durumuna geçince | Tüm parçalar ARRIVED/IN_STOCK |
| Teslim tarihi hatırlatma | Varsayılan 1 gün önce; gecikince günde bir | Teslim edilince |
| Servis tamamlandı | İş tamamlandı durumuna ilk geçişte | — |
| Kritik stok | AVAILABLE stok critical_stock_level'e eşit/altına inince | Eşik üstüne çıkınca |
| Vade hatırlatma | Vade gününde + gecikme 7 günü aşınca | Bakiye kapanınca |
| Eşitleme sorunu | Eşitlenemeyen kayıt / çakışma kuyruğunda bekleyen | Çözülünce |

- [x] `dedupe_key` ile cihaz başına tekrarlı bildirim engellenir
- [x] Okundu/çözüldü bilgisi sunucuya eşitlenir; çevrimdışı okundu bilgisi bağlantı gelince eşitlenir
- [x] Telefon anlık bildirimi ve WhatsApp MVP dışı; uygulama içi bildirimler

> Uygulandı: `notifications/*` (çekirdek `core.ts`: deterministik kimlik + `dedupe_key`; vade, servis/teslim/parça/onay/tamamlandı, kritik/eksi stok, eşitleme sorunu bildirimleri), okundu/çözüldü işareti sunucuya eşitlenir (çevrimdışı işaret kuyrukta bekler). Telefon bildirimi/WhatsApp MVP dışı.

**İlgili FR:** FR-022  
**İlgili AC:** AC-028, AC-038  
**Test:** TC-029, TC-039

---

### ADIM 6.7 — Eşitleme, Yedek ve Bildirim Merkezi (UI)

**Görevler:**
- [x] Tek ekranda:
  - Son başarılı eşitleme zamanı
  - Bekleyen ve hatalı kayıt sayısı
  - Çakışma kuyruğu listesi
  - Son yedek tarihi/durumu
  - Bildirim listesi (okundu/çözüldü işaretleme)
- [x] Dışa aktarma başlatma düğmesi
- [x] Geri yükleme başlatma düğmesi

> Uygulandı: `/notifications` (üstte zil simgesi + okunmamış sayısı): son eşitleme, bekleyen ve hatalı kayıt sayısı, çakışma kuyruğu (yeniden dene / benim değişikliğimi uygula / sunucudaki sürümü al — sessiz ezme yok), son yedek, bildirim listesi, yedekleme ve dışa aktarma kısayolları.

**İlgili PRD:** §4.8

---

### ADIM 6.8 — XLSX/CSV Dışa Aktarma

**Görevler:**
- [x] Dışa aktarma kimlik doğrulama gerektirir (AC-049)
- [x] Hassas veri uyarısı gösterilir
- [x] **Dışa aktarma hedefleri:**
  - Müşteri listesi
  - Ürün/stok listesi
  - Satış raporu (belirli tarih aralığı)
  - Tahsilat raporu
  - Servis geliri raporu
  - Müşteri bakiyeleri
  - Tedarikçi bakiyeleri
  - Stok hareketleri
- [x] Türkçe karakter uyumluluğu (UTF-8 BOM veya Excel ayraç uyumluluğu)
- [x] Tarih/tutar biçimleri Türkiye standardına uygun

> Uygulandı: `/reports/export` ve her raporda **CSV / Excel indir**: hassas veri uyarısı onayı + kimlik yeniden doğrulama (PIN, yoksa hesap şifresi; AC-049), audit log. CSV UTF-8 BOM, `;` ayraç, gg.aa.yyyy tarih, virgüllü tutar, formül enjeksiyonu koruması; XLSX gerçek sayı ve Türkçe karakter (`lib/export`, testli). Hedefler: müşteri, ürün/stok, satış belgeleri, ödeme hareketleri, müşteri bakiyeleri (yaşlandırmalı), tedarikçi bakiyeleri, stok hareketleri; servis geliri ve diğer raporlar kendi sayfalarında.

**İlgili FR:** FR-026  
**İlgili AC:** AC-024, AC-049  
**Test:** TC-026, TC-050

---

### ADIM 6.9 — Satış Raporları

**Görevler:**
- [x] **Günlük/Aylık Satış Raporu (§15):**
  - Satış belgelerinin belge tarihine göre brüt, indirim, iade, iptal, net satış toplamları
  - KDV dahil brüt tutar; vergi tutarı ayrı sütunda
- [x] **Tahsilat Raporu:**
  - Fiilî ödeme hareketlerinin ödeme tarihine göre nakit/kart/banka/diğer ayrımı
  - Veresiye satış dahil edilmez
- [x] Tarih filtreleri yerel Türkiye tarihine göre
- [x] İade/iptal orijinal belgeyi silmez; ters kayıt olarak net toplamdan düşer

> Uygulandı: `/reports/sales` (günlük/aylık; brüt KDV dahil, indirim, KDV ayrı sütun, iade, iptal, net) ve `/reports/collections` (yönteme göre; veresiye girmez). Tarihler Europe/Istanbul takvimine göre; iade/iptal kendi tarihinde ters kayıt olarak düşer (`reports/calc.ts`, K-041).

**İlgili AC:** AC-023  
**Test:** TC-025

---

### ADIM 6.10 — Servis Geliri Raporu

**Görevler:**
- [x] Tamamlanan (first_completed_at dolu) ücretli servis kalemlerinin tahakkuk eden tutarı
- [x] Tamamlanma tarihine göre (tahsilattan ayrı)
- [x] Yeniden açılan servis ikinci kez sayılmaz
- [x] İptal/iade düzeltmeleri ve iptalde alınan inceleme ücreti dahil

> Uygulandı: `/reports/service-revenue`: tamamlanma tarihine göre tahakkuk, tahsilattan ayrı, yeniden açılan ikinci kez sayılmaz, iade/düzeltme düşer, iptalde alınan inceleme ücreti eklenir.

**Test:** TC-025

---

### ADIM 6.11 — Aktif Servisler Raporu

**Görevler:**
- [x] Duruma, bekleme sebebine, vaat edilen teslim tarihine göre servis listesi
- [x] Filtreleme: duruma göre, teslim tarihine göre
- [x] Gecikmeli ve yaklaşan teslimler öne çıkar

> Uygulandı: `/reports/active-services`: duruma ve teslim tarihine göre filtre; gecikenler önce, sonra yaklaşanlar.

---

### ADIM 6.12 — Müşteri & Tedarikçi Bakiye Raporları

**Görevler:**
- [x] **Müşteri bakiyeleri raporu:** müşteri bazında bakiye + hareket dökümü + yaşlandırma bantları
- [x] **Tedarikçi bakiyeleri raporu:** borç, ödemeler, iadeler, kalan borç

> Uygulandı: `/reports/balances` (müşteri + yaşlandırma, tedarikçi), `/reports/statement` (müşteri hesap ekstresi, yürüyen bakiye); tedarikçi kolonları dışa aktarımda (açılış, alım, ödeme, iade, kalan).

**İlgili AC:** AC-023

---

### ADIM 6.13 — Stok Raporu

**Görevler:**
- [x] Anlık satılabilir ve hasarlı stok miktarları
- [x] Kritik seviye kıyaslaması
- [x] Ürün bazlı giriş/çıkış ve hareket kaynağı
- [x] Stok hareket geçmişi detay görüntüleme

> Uygulandı: `/reports/stock`: anlık satılabilir/hasarlı stok, kritik seviye karşılaştırması, dönem giriş/çıkışı ve ürün bazlı hareket geçmişi (kaynak notuyla).

---

### ADIM 6.14 — Makine Geçmişi Raporu

**Görevler:**
- [x] Makineye bağlı tamamlanmış servisler, tarih, işlem ve servis sayısı

> Uygulandı: `/reports/machines`: tamamlanmış servisi olan makineler, servis sayısı, son servis ve işlem özeti.

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
