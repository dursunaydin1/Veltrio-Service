# FAZ 7 — Sağlamlaştırma

> PRD §20 Faz 7 | Önkoşul: FAZ 1-6 tamamlanmış olmalı

---

## Amaç

Uygulamanın canlıya çıkmadan önce güvenlik, performans, çok cihaz senaryoları, kullanılabilirlik ve kullanıcı kabul testlerinden geçmesi.

> **Önemli Not (PRD §20):** Çakışma ve çok cihaz testleri FAZ 7'ye bırakılmaz; her fazın kabulünde o fazın varlıkları için koşturulur. FAZ 7 bu testlerin kapsamlı son turunu içerir.

---

## Adım Adım İşlem Basamakları

### ADIM 7.1 — iOS/Android Tarayıcı ve PWA Testleri

**Görevler:**
- [ ] Desteklenen tarayıcı/OS matrisi yayınla
- [ ] Hedef cihazlarda test et: güncel Chrome/Edge ve yaygın mobil tarayıcılar
- [ ] **Test edilecek özellikler:**
  - Kamera/QR tarama (iOS ve Android)
  - Çevrimdışı veri (IndexedDB/OPFS kalıcılığı)
  - Fotoğraf ekleme ve yükleme kuyruğu
  - Tarayıcıdan yazdırma ve PDF kaydetme
  - PWA kurulumu ve ana ekrana ekleme
  - Tarayıcı önbelleği temizleme riski → kullanıcıya görünür uyarı
- [ ] Kalıcı depolama izni (persistent storage API) talebi
- [ ] Kritik veri yalnızca tarayıcı önbelleğine emanet edilmez

**İlgili NFR:** NFR-008  
**İlgili PRD:** §11.5

---

### ADIM 7.2 — Güvenlik Testleri

**Görevler:**
- [ ] Business izolasyonu: başka business_id kayıtlarına erişim denemeleri (AC-019, TC-021)
- [ ] Tahmin edilebilir ID ile erişim denemeleri
- [ ] QR kodu yetkisiz erişim testi: oturum açmamış kullanıcı giriş ekranına yönlendiriliyor
- [ ] Dışa aktarma: kimlik doğrulama ve hassas veri uyarısı (AC-049, TC-050)
- [ ] PIN deneme sınırı ve kilit (AC-020, TC-022)
- [ ] Hesap kurtarma e-posta akışı (AC-048, TC-049)
- [ ] Cihaz iptali ve yerel veri silme (AC-045, TC-046)
- [ ] HTTPS/TLS zorunluluğu
- [ ] Hassas veri düz metin saklanmaması denetimi
- [ ] API endpoint'lerinde business_id kontrolü

**İlgili NFR:** NFR-005, NFR-009  
**Test:** TC-021, TC-022, TC-046, TC-049, TC-050

---

### ADIM 7.3 — Çok Cihaz ve Çevrimdışı Eşitleme Testleri

**Görevler:**
- [ ] İki cihaz çevrimdışı son ürünü tüketir → eşitleme çakışması ve çözüm akışı (AC-009, TC-012)
- [ ] İki cihaz çevrimdışı belge üretir → UUID benzersiz; numara çakışması audit log (AC-016, TC-018)
- [ ] İki cihaz çevrimdışı aynı seri birimi satar → çakışma kuyruğu (AC-039, TC-040)
- [ ] Aynı eşitleme paketi tekrar gönderilir → sunucuda bir kayıt (AC-036, TC-037)
- [ ] Eşitleme hatası → kayıt silinmez, kuyrukta kalır (AC-037, TC-038)
- [ ] Çevrimdışı hesaplanan toplam sunucuyla farklı → çakışma kuyruğuna, sessiz değişiklik olmaz (AC-026, TC-051)
- [ ] Çevrimdışı satın alma ve iade eşitleme → tutarlı stok ve bakiye, kopya yok (TC-053)
- [ ] Stok bakiyesini hareketlerden yeniden hesaplama → Product alanlarıyla eşleşiyor (TC-054)

**İlgili NFR:** NFR-004

---

### ADIM 7.4 — Performans ve Kullanılabilirlik Testleri

**Görevler:**
- [ ] Yeni servis açılışı: mevcut müşteri/makine için ~30 sn; yeni müşteri/makine için ~90 sn (NFR-002)
- [ ] Online arama ve kart açılışı: p95 < 2,5 sn (NFR-003)
- [ ] Büyük veri hacminde (500+ müşteri, 1000+ servis) liste açılış testleri
- [ ] Mobil öncelikli: temel akışlar tek elle, yatay kaydırma gerektirmeden (NFR-001)
- [ ] Yeterli kontrast, dış mekânda okunabilir font boyutu (NFR-013)
- [ ] Dokunma hedefleri ≥ 44x44px
- [ ] Klavye erişimi ve form hata açıklamaları

---

### ADIM 7.5 — Yedekleme ve Geri Yükleme Provası

**Görevler:**
- [ ] Günlük yedek çalışıyor; son yedek tarihi görünür
- [ ] Yedekten geri yükleme test edildi (PRD §12.3):
  - Geri yükleme öncesi ek yedek alındı
  - Hedef veri kümesi ve üzerine yazma etkisi gösterildi
  - Kullanıcıdan kritik onay alındı
  - Geri yükleme audit log'a yazıldı
- [ ] RPO ≤ 24 saat ölçüldü
- [ ] RTO ≤ 1 iş günü ölçüldü
- [ ] Yedekler şifreleniyor ve yetkisiz erişime karşı korunuyor

**İlgili NFR:** NFR-006, NFR-012  
**Test:** TC-030

---

### ADIM 7.6 — Kapsamlı Kabul Kriterleri Kontrolü (AC-001 → AC-051)

**Görevler:**
- [ ] PRD §18'deki 51 kabul kriterini tek tek test et
- [ ] Her AC için test senaryosu eşleştirmesi yap
- [ ] Başarısız olanları düzelt ve yeniden test et
- [ ] Tüm AC'ler geçti belgesi hazırla

**Başlıca AC kontrol noktaları:**

| AC | Konu |
|----|------|
| AC-001 | Servis UUID ve belge numarası oluşuyor |
| AC-004 | Onaylanmayan kalem toplama girmiyor |
| AC-005 | Şablon kopyası şablon değişikliğinden etkilenmiyor |
| AC-007 | ServicePart'ta snapshot ve stok hareketi |
| AC-009 | İki cihaz çevrimdışı çakışması |
| AC-016 | UUID benzersizliği ve numara çakışması |
| AC-019 | Business izolasyonu |
| AC-026 | Çevrimdışı toplam uyuşmazlığı |
| AC-036 | Idempotent eşitleme |
| AC-039 | Seri birim çift satış engeli |
| AC-050 | Maliyet snapshot'ı |
| AC-051 | Geçici makine birleştirme |

---

### ADIM 7.7 — Kullanıcı Kabul Testi (UAT)

**Görevler:**
- [ ] Gerçek işletme sahibiyle UAT planı hazırla
- [ ] Temel akışları gerçek veriyle test et:
  - Müşteri kaydı ve servis açma
  - Servis tamamlama ve tahsilat
  - Ürün satışı
  - Stok düzeltme
  - Rapor görüntüleme
- [ ] Kullanıcı geri bildirimlerini topla
- [ ] Kritik UX sorunlarını düzelt

---

### ADIM 7.8 — KVKK ve Hukuki Kontrol

**Görevler:**
- [ ] Aydınlatma metni hazırla (hukuk danışmanıyla)
- [ ] İşleme amacı, hukuki sebep, saklama süresi tanımla
- [ ] Veri sahibi başvuru süreci belirle
- [ ] Fotoğraf kullanımı politikası
- [ ] Hizmet sağlayıcının veri lokasyonu ve KVKK değerlendirmesi
- [ ] Hata günlükleri gereksiz kişisel veri içermiyor mu kontrol et

**İlgili PRD:** §12.4, §22

---

### ADIM 7.9 — Canlıya Çıkış Kontrol Listesi (PRD §22)

**Görevler:**
- [ ] Business/User/Device izolasyonu ve yetkisiz erişim testleri geçti
- [ ] Müşteri/makine kayıtları, mükerrer uyarısı, arşivleme ve makine geçmişi çalışıyor
- [ ] Servis durum geçişleri, onay eşiği/tutarı, garanti, kapora ve servis sayacı testleri geçti
- [ ] ServicePart, stok hareketi, negatif stok, hasarlı stok ve çevrimdışı stok çakışması testleri geçti
- [ ] Seri takipli makine satışı ve satın alma/iade akışları çalışıyor
- [ ] Veresiye tahsilattan ayrıldı; kısmi ödeme, ödeme tahsisi, iade, iptal ve müşteri/tedarikçi bakiyesi mutabık
- [ ] Açılış stokları ve bakiyeler örnek dosyayla içe aktarıldı; çift yükleme önlendi
- [ ] Eşitleme idempotency, hata kuyruğu ve çok cihaz çakışma testleri geçti; toplam uyuşmazlığı akışı doğrulandı
- [ ] Yedekten geri yükleme tatbikatı yapıldı; RPO ≤24 saat ve RTO ≤1 iş günü ölçüldü
- [ ] PIN, hesap kurtarma, cihaz iptali ve veri dışa aktarma güvenliği test edildi
- [ ] iOS/Android hedef cihazlarda QR, kamera, çevrimdışı veri, fotoğraf kuyruğu ve yazdırma test edildi
- [ ] KVKK aydınlatma metni, saklama ve veri lokasyonu hukuk danışmanıyla kontrol edildi
- [ ] Türkçe karakter, TL, tarih, CSV/XLSX dışa aktarma ve PDF fişler kontrol edildi
- [ ] Kullanıcıya hata, eşitleme çakışması, son yedek ve bekleyen kayıtlar anlaşılır gösteriliyor
- [ ] Kritik işlem düzeltme geçmişi ve arşivleme doğrulandı
- [ ] MVP kapsamı dışındaki özellikler açıkça sonraki sürüme ayrıldı
- [ ] Kullanıcı kabul testi tamamlandı; bilinen kısıtlar ve işletme kullanım kılavuzu teslim edildi

---

### ADIM 7.10 — İşletme Kullanım Kılavuzu

**Görevler:**
- [ ] Günlük kullanım senaryoları (servis açma, satış, tahsilat)
- [ ] Çevrimdışı çalışma sınırlamaları
- [ ] Veri yedekleme ve geri yükleme adımları
- [ ] QR etiketi basma talimatı
- [ ] Bilinen kısıtlar ve sonraki sürüm planı
- [ ] Yardım ekranı içeriği uygulamaya eklendi (PRD §4.7)

---

## FAZ 7 Tamamlanma Kriterleri

| # | Kriter |
|---|--------|
| 1 | Tüm 51 kabul kriteri (AC-001→AC-051) geçti |
| 2 | iOS/Android hedef cihazlarda tam test tamamlandı |
| 3 | Business izolasyonu testleri geçti |
| 4 | Yedekten geri yükleme tatbikatı yapıldı; RPO/RTO hedefi ölçüldü |
| 5 | UAT tamamlandı ve kritik UX sorunları giderildi |
| 6 | KVKK kontrolleri yapıldı |
| 7 | Kullanım kılavuzu teslim edildi |

---

## Sonraki Adımlar (MVP Sonrası)

PRD §1.3'e göre sonraki sürümlerde planlanmış özellikler:
- Resmî e-fatura/e-arşiv entegrasyonu
- WhatsApp/SMS otomatik gönderim
- Gelişmiş kâr/maliyet analizi
- Rol bazlı yetki yönetimi
- Garanti bakım kampanyaları
- Muhasebe yazılımı entegrasyonu

---

*Bu döküman, tüm fazlar tamamlandığında gözden geçirilecektir.*
