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
- [x] Desteklenen tarayıcı/OS matrisi yayınla
- [ ] Hedef cihazlarda test et: güncel Chrome/Edge ve yaygın mobil tarayıcılar
- [ ] **Test edilecek özellikler:**
  - Kamera/QR tarama (iOS ve Android)
  - Çevrimdışı veri (IndexedDB/OPFS kalıcılığı)
  - Fotoğraf ekleme ve yükleme kuyruğu
  - Tarayıcıdan yazdırma ve PDF kaydetme
  - PWA kurulumu ve ana ekrana ekleme
  - Tarayıcı önbelleği temizleme riski → kullanıcıya görünür uyarı
- [x] Kalıcı depolama izni (persistent storage API) talebi
- [x] Kritik veri yalnızca tarayıcı önbelleğine emanet edilmez

> Uygulandı: `public/sw.js` (uygulama kabuğu + çevrimdışı sayfa), PWA simgeleri (klasör boştu, `scripts/make-icons.mjs` ile üretildi), manifest, `PwaBanner` (kalıcı depolama / alan uyarısı, ana ekrana ekleme), `navigator.storage.persist()`; matris ve cihaz test listesi: `docs/10_TARAYICI_VE_CIHAZ_TESTI.md`. **Açık (elle, gerçek cihazda):** hedef cihazlarda test ve özellik denemeleri (QR/kamera, fotoğraf kuyruğu, yazdırma, PWA kurulumu, önbellek temizleme).

**İlgili NFR:** NFR-008  
**İlgili PRD:** §11.5

---

### ADIM 7.2 — Güvenlik Testleri

**Görevler:**
- [x] Business izolasyonu: başka business_id kayıtlarına erişim denemeleri (AC-019, TC-021)
- [x] Tahmin edilebilir ID ile erişim denemeleri
- [ ] QR kodu yetkisiz erişim testi: oturum açmamış kullanıcı giriş ekranına yönlendiriliyor
- [ ] Dışa aktarma: kimlik doğrulama ve hassas veri uyarısı (AC-049, TC-050)
- [x] PIN deneme sınırı ve kilit (AC-020, TC-022)
- [ ] Hesap kurtarma e-posta akışı (AC-048, TC-049)
- [ ] Cihaz iptali ve yerel veri silme (AC-045, TC-046)
- [x] HTTPS/TLS zorunluluğu
- [x] Hassas veri düz metin saklanmaması denetimi
- [x] API endpoint'lerinde business_id kontrolü

> Uygulandı: e2e 7i (RLS: yabancı işletme kaydı eklenemez/okunamaz, tahmin edilen kimlik boş), `pin.test.ts`, güvenlik başlıkları (`next.config.js`, HSTS), kod incelemesi (`docs/11_GUVENLIK_VE_YEDEK.md`). **Açık (elle):** QR yetkisiz erişim, dışa aktarma doğrulaması, hesap kurtarma e-postası, cihaz iptali + silme uçtan uca (`docs/09` M-1, M-3..M-5).

**İlgili NFR:** NFR-005, NFR-009  
**Test:** TC-021, TC-022, TC-046, TC-049, TC-050

---

### ADIM 7.3 — Çok Cihaz ve Çevrimdışı Eşitleme Testleri

**Görevler:**
- [x] İki cihaz çevrimdışı son ürünü tüketir → eşitleme çakışması ve çözüm akışı (AC-009, TC-012)
- [x] İki cihaz çevrimdışı belge üretir → UUID benzersiz; numara çakışması audit log (AC-016, TC-018)
- [x] İki cihaz çevrimdışı aynı seri birimi satar → çakışma kuyruğu (AC-039, TC-040)
- [x] Aynı eşitleme paketi tekrar gönderilir → sunucuda bir kayıt (AC-036, TC-037)
- [x] Eşitleme hatası → kayıt silinmez, kuyrukta kalır (AC-037, TC-038)
- [x] Çevrimdışı hesaplanan toplam sunucuyla farklı → çakışma kuyruğuna, sessiz değişiklik olmaz (AC-026, TC-051)
- [x] Çevrimdışı satın alma ve iade eşitleme → tutarlı stok ve bakiye, kopya yok (TC-053)
- [x] Stok bakiyesini hareketlerden yeniden hesaplama → Product alanlarıyla eşleşiyor (TC-054)

> Uygulandı: `test/multidevice.test.ts`, `sync/apply.test.ts` (yeniden numaralama), `sync/verify.test.ts`, `stock/integrity` testleri ve gerçek sunucuya karşı e2e (7, 7c, 7d, 7j). Çakışma çözüm akışı: bildirim merkezi (`sync/conflicts.ts`).

**İlgili NFR:** NFR-004

---

### ADIM 7.4 — Performans ve Kullanılabilirlik Testleri

**Görevler:**
- [ ] Yeni servis açılışı: mevcut müşteri/makine için ~30 sn; yeni müşteri/makine için ~90 sn (NFR-002)
- [ ] Online arama ve kart açılışı: p95 < 2,5 sn (NFR-003)
- [x] Büyük veri hacminde (500+ müşteri, 1000+ servis) liste açılış testleri
- [ ] Mobil öncelikli: temel akışlar tek elle, yatay kaydırma gerektirmeden (NFR-001)
- [ ] Yeterli kontrast, dış mekânda okunabilir font boyutu (NFR-013)
- [x] Dokunma hedefleri ≥ 44x44px
- [ ] Klavye erişimi ve form hata açıklamaları

> Uygulandı: `test/performance.test.ts` (800 müşteri, 1.500 servis/satış, 6.000 hareket; arama, bakiye, rapor eşikleri) — bu test `getBalances`'ın imleçle dolaşması yüzünden ölçekte yavaş olduğunu gösterdi, toplu okumaya çevrildi; tüm düğmeler ≥ 44 px (`.btn-sm` 36 → 44). **Açık (elle):** servis açılış süreleri (30/90 sn), çevrimiçi arama p95, tek elle kullanım, kontrast ve klavye erişimi denetimi (cihazda).

---

### ADIM 7.5 — Yedekleme ve Geri Yükleme Provası

**Görevler:**
- [ ] Günlük yedek çalışıyor; son yedek tarihi görünür
- [x] Yedekten geri yükleme test edildi (PRD §12.3):
  - Geri yükleme öncesi ek yedek alındı
  - Hedef veri kümesi ve üzerine yazma etkisi gösterildi
  - Kullanıcıdan kritik onay alındı
  - Geri yükleme audit log'a yazıldı
- [ ] RPO ≤ 24 saat ölçüldü
- [ ] RTO ≤ 1 iş günü ölçüldü
- [ ] Yedekler şifreleniyor ve yetkisiz erişime karşı korunuyor

> Uygulandı: elle yedek + ekleyici geri yükleme (ek yedek, özet, onay, audit) birim ve gerçek sunucu e2e ile test edildi (`backup/*.test.ts`, e2e 7j); sunucu görevi kodlandı ve testlidir. **Açık (dağıtımda):** `SUPABASE_SERVICE_ROLE_KEY`/`CRON_SECRET` tanımlanıp ilk gece yedeğinin doğrulanması, RPO/RTO'nun canlı projede ölçülmesi ve yedek deposu erişim denetimi (`docs/11` §2).

**İlgili NFR:** NFR-006, NFR-012  
**Test:** TC-030

---

### ADIM 7.6 — Kapsamlı Kabul Kriterleri Kontrolü (AC-001 → AC-051)

**Görevler:**
- [ ] PRD §18'deki 51 kabul kriterini tek tek test et
- [x] Her AC için test senaryosu eşleştirmesi yap
- [x] Başarısız olanları düzelt ve yeniden test et
- [ ] Tüm AC'ler geçti belgesi hazırla

> Uygulandı: `docs/09_KABUL_KRITERLERI.md` (51 AC ↔ test/kanıt). Otomatik kanıtı olanlar yeşil; 6 AC cihazda elle doğrulama bekler (M-1..M-5). “Tüm AC'ler geçti” belgesi bu elle adımlar bitince imzalanır.

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
- [x] Gerçek işletme sahibiyle UAT planı hazırla
- [ ] Temel akışları gerçek veriyle test et:
  - Müşteri kaydı ve servis açma
  - Servis tamamlama ve tahsilat
  - Ürün satışı
  - Stok düzeltme
  - Rapor görüntüleme
- [ ] Kullanıcı geri bildirimlerini topla
- [ ] Kritik UX sorunlarını düzelt

> Uygulandı: `docs/12_UAT_VE_CANLIYA_CIKIS.md` §1 (12 senaryo, geri bildirim formu). Gerçek kullanım ve geri bildirim işletme sahibiyle yapılacak.

---

### ADIM 7.8 — KVKK ve Hukuki Kontrol

**Görevler:**
- [ ] Aydınlatma metni hazırla (hukuk danışmanıyla)
- [ ] İşleme amacı, hukuki sebep, saklama süresi tanımla
- [ ] Veri sahibi başvuru süreci belirle
- [ ] Fotoğraf kullanımı politikası
- [ ] Hizmet sağlayıcının veri lokasyonu ve KVKK değerlendirmesi
- [ ] Hata günlükleri gereksiz kişisel veri içermiyor mu kontrol et

> Hazırlandı (taslak): `docs/13_KVKK.md` (veri envanteri, aydınlatma metni taslağı, saklama önerisi, başvuru süreci, fotoğraf politikası, veri lokasyonu notları). **Hukuk danışmanı onayı olmadan bu adımdaki hiçbir madde tamamlanmış sayılmaz.**

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

> Durum tablosu ve teknik ön hazırlık: `docs/12_UAT_VE_CANLIYA_CIKIS.md` §2. Otomatik kanıtlı maddeler orada ✅; cihaz testi, yedek tatbikatı, KVKK ve UAT maddeleri insan onayı bekler, bu yüzden burada işaretlenmedi.

---

### ADIM 7.10 — İşletme Kullanım Kılavuzu

**Görevler:**
- [x] Günlük kullanım senaryoları (servis açma, satış, tahsilat)
- [x] Çevrimdışı çalışma sınırlamaları
- [x] Veri yedekleme ve geri yükleme adımları
- [x] QR etiketi basma talimatı
- [x] Bilinen kısıtlar ve sonraki sürüm planı
- [x] Yardım ekranı içeriği uygulamaya eklendi (PRD §4.7)

> Uygulandı: `docs/KULLANIM_KILAVUZU.md`, uygulama içi **Menü → Yardım** (`/help`).

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
