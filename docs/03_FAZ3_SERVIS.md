# FAZ 3 — Servis Modülü

> PRD §20 Faz 3 | Önkoşul: FAZ 1 + FAZ 2 tamamlanmış olmalı

---

## Amaç

Uygulamanın kalbi olan servis akışını hayata geçirmek: müşteri kabulünden teşhis, onay, parça kullanımı, tamamlama ve teslimat süreçleri dahil tüm servis yaşam döngüsü.

---

## Adım Adım İşlem Basamakları

### ADIM 3.1 — Müşteri ve Makine Varlıkları

**Görevler:**
- [x] `Customer` tablosu (fotoğraf alanı hariç):
  - id, business_id, name, phone, normalized_phone, no_phone_flag, address/village, notes, optional_photo_ref, archived_at
- [x] `Machine` tablosu (satış/garanti alanları ilgili adımlarla):
  - id, business_id, customer_id, type, brand, model, serial_number (nullable), internal_number (MK-...)
  - status (TEMPORARY / ACTIVE / INACTIVE), sale_date, sale_price, warranty_end, notes, photo_refs, archived_at
- [x] `MachineOwnershipHistory` tablosu (`machine_ownership_history`, migration 012):
  - id, business_id, machine_id, old_customer_id, new_customer_id, changed_at, reason, actor_id, device_id

**Kabul kriteri:**
- Müşteri ve makine oluşturulur; makine bir müşteriyle ilişkilendirilir.

---

### ADIM 3.2 — Müşteri Yönetimi

**Görevler:**
- [x] Müşteri oluşturma: ad-soyad, telefon, adres/köy (zorunlular); fotoğraf, notlar (isteğe bağlı)
- [x] **Telefon normalizasyonu** (Adım 1.10'da temel alındı):
  - Boşluk, tire, parantez temizle
  - 0 ile başlayan ve +90 ile başlayan biçimler aynı kabul edilir
  - Aynı normalize telefonla kayıtlı müşteri varsa → mevcut müşteri önerilir
  - Kullanıcı yine de bilinçli olarak yeni kayıt açabilir (AC-029)
- [x] Telefonu olmayan müşteri için `no_phone_flag = true`
- [x] Gereksiz kişisel veri (T.C. kimlik no) istenmez
- [x] Müşteri listesi: ad-soyad, telefon, açık bakiye göstergesi, hızlı arama
- [ ] Müşteri profili: makineler, servis geçmişi, satışlar, ödemeler, bakiye, hızlı işlemler
- [x] "Ara" ve "WhatsApp'ta aç" bağlantıları (elle açar, otomatik değil)
- [ ] Müşteri fotoğrafı: istemci tarafında 1600px küçültme, JPEG/WebP (FR-028)
- [x] Müşteri arşivleme: açık servisi veya sıfır olmayan bakiyesi varsa engellenir (AC-030)

> Uygulandı: migration 010 (`no_phone_flag`), `src/lib/customers/` (şema, servis), `src/components/customers/`, `/customers`, `/customers/new`, `/customers/[id]`. Mükerrer telefon yazarken uyarılır (AC-029), kullanıcı bilinçli olarak ayrı kayıt açabilir. Arşivleme açık servis varsa engellenir (AC-030); sıfırdan farklı bakiye de arşivlemeyi engeller. Açık: müşteri fotoğrafı (FR-028), müşteri profilindeki makine/servis/satış/ödeme/bakiye bölümleri (ilgili adımlarla). Köy/mahalle zorunlu, açık adres isteğe bağlı (K-018).

**İlgili FR:** FR-003  
**Test:** TC-031, TC-032

---

### ADIM 3.3 — Makine Yönetimi

**Görevler:**
- [x] Makine oluşturma: tür, marka, model (zorunlu); seri numarası (isteğe bağlı)
- [x] Seri numarası yoksa sistem benzersiz iç makine numarası üretir (MK-...)
- [x] Aynı markada aynı seri numarası mevcutsa → uyarı; kullanıcı onayıyla devam (AC-029)
- [ ] Makine profili: sahibi, seri/iç numara, tür/marka/model, satış bilgisi, garanti bitiş tarihi, servis sayısı, son servis tarihi, servis geçmişi, sahiplik geçmişi
- [ ] İşlemler: Yeni Servis, QR göster/tara, Düzenle, Sahip değiştir, Birleştir
- [x] **Makine sahipliği değişimi:** MachineOwnershipHistory kaydı oluşur; servis geçmişi korunur (AC-018, TC-020)
- [ ] **Geçici makine kaydı (TEMPORARY):** Makine belirlenemiyorsa açılır; sonradan ACTIVE'e dönüştürülür veya mevcut makineyle birleştirilir (SR-016, AC-051)
- [x] Makine arşivleme: açık servisi varsa engellenir (FR-033)

> Uygulandı: migration 012 (`internal_number`, `machine_ownership_history`), `src/lib/machines/` (şema, servis), `/machines`, `/machines/new`, `/machines/[id]`, müşteri sayfasında Makineler bölümü, ortak `CustomerPicker`. Geçici kayıt açılır ve marka/model girilince etkin makineye dönüşür. **Açık:** makine profilindeki satış bilgisi / garanti / servis sayısı / son servis (servis akışıyla), "Yeni Servis" ve QR göster/tara eylemleri (3.4, 3.6), geçici makineyi mevcut makineyle **birleştirme** (AC-051; servisler yazılınca). `status` sütunu açılmadı: geçici = `is_temporary`, pasif = arşiv (K-020).

**İlgili FR:** FR-004, FR-005  
**Test:** TC-020, TC-052

---

### ADIM 3.4 — QR Kodu Sistemi (Makine & Ürün)

**Görevler:**
- [ ] Makine QR kodu: yalnızca değişmeyen kayıt kimliği/URL içerir
- [ ] QR ile makine açıldığında: oturum kontrolü → giriş ekranı (oturum yoksa) → makine özeti
- [ ] Makine QR ekranı: makine özeti, sahibi, geçmiş servisler, "Yeni Servis Başlat" eylemi
- [ ] Ürün QR ekranı: ad/kod, mevcut stok, satış fiyatı, son alış fiyatı
- [ ] Etiket boyutu ayardan seçilebilir; QR + kısa kimlik/ürün adı + isteğe bağlı işletme adı
- [ ] Ürün fiyatı/stoğu değiştiğinde QR yeniden basılmadan güncel veriyi gösterir (AC-035)

**İlgili FR:** FR-006  
**İlgili AC:** AC-003, AC-035  
**Test:** TC-003, TC-036

---

### ADIM 3.5 — Kataloglar (Arıza, İşlem, Şablon)

**Görevler:**
- [x] `OperationCatalog` (işlem kataloğu): ad, kategori, önerilen fiyat, varsayılan süre, aktif
- [x] `IssueCatalog` (arıza kataloğu): ad, kategori, aktif
- [x] `ServiceTemplate` ve `ServiceTemplateItem` (şablon ve şablon maddeleri)
- [x] Başlangıç işlem kategorileri (§8.1): Arıza Tespiti, Genel Bakım, Karbüratör, Filtre, Buji, Marş, Bıçak/Zincir/Pala, Montaj, İlk Çalıştırma, Motor Testi, Diğer
- [x] Başlangıç arıza kategorileri (§8.1): Çalışmıyor, Zor Çalışıyor, Güç Kaybı, Stop Ediyor, Yakıt Kaçağı, Yağlama Sorunu, Titreşim/Ses, Kesmiyor/Biçmiyor, Parça Kırığı/Hasarı, Bakım Talebi, Diğer
- [x] Katalog ekleme, düzenleme, pasifleştirme
- [x] Kullanılmış geçmiş satırların açıklamaları geriye dönük değişmez

> Uygulandı: migration 021, `catalog/service.ts`, **Ayarlar → Kataloglar** (işlem ve arıza: ekle, düzenle, pasifleştir; aynı ad tekrar edilemez), servis kabulünde hızlı arıza seçimi ve işlem eklerken “Katalogdan seç” katalogdan beslenir; servise kopyalanan açıklama/fiyat sonradan değişmez. Kategoriler §8.1 listesinden sabittir (K-035).

**İlgili FR:** FR-009, FR-011

---

### ADIM 3.6 — Servis Emri Oluşturma (Kabul)

**Görevler:**
- [x] `ServiceOrder` tablosunu oluştur (PRD §7 tam alan listesi)
- [x] `ServiceIssue`, `ServiceOperation`, `ServicePart`, `ServiceApproval`, `ServiceStatusHistory`, `ServiceChecklistItem` tablolarını oluştur
- [x] Yeni Servis akışı (§5.1) — kataloğun yerini şimdilik sabit arıza başlıkları (düğme) + serbest metin alıyor:
  1. Mevcut müşteri seçimi veya yeni müşteri oluşturma (mükerrer uyarısı çalışır)
  2. Müşterinin makineleri listelenir; seçim / QR / yeni makine açma
  3. Makine seçilince: son servis tarihi, son işlem, servis sayısı özeti gösterilir
  4. Şikâyet girişi: katalogdan seçim + serbest metin + 'Diğer' seçeneği
  5. Kabul bilgileri: fotoğraf (isteğe bağlı), mevcut hasar/çizikler, teslim alınan aksesuarlar, müşteri beyanı
  6. Kayıt açılır; teşhis ve diğerleri sonra tamamlanabilir
- [x] Belge numarası: `S-[cihaz_kodu]-[yıl]-[sıra]`
- [x] Başlangıç durumu: "Kabul edildi"
- [x] Servis oluştuğunda UUID ve belge numarası oluşur (AC-001)

> Uygulandı: migration 013, `src/lib/services/` (`openService`, `changeServiceStatus`, `updateServiceDetails`, `getMachineServiceSummary`), `/services` (liste), `/services/new` (kabul formu: müşteri → makine / geçici makine → şikâyet → hasar, aksesuar, teslim sözü, kapora), `/services/[id]`. Kapora servise bağlı tahsilat olarak yazılır (SR-018) ve müşteri bakiyesini düşürür. **Not:** `ServiceIssue` ayrı tablo değildir; şikâyet metni serviste saklanır, katalog yalnızca hızlı seçimdir (K-035). **Açık:** kabul fotoğrafı.

**İlgili FR:** FR-007  
**İlgili AC:** AC-001, AC-002  
**Test:** TC-001, TC-002

---

### ADIM 3.7 — Servis Durum Makinesi

**Görevler:**
- [x] Durum değerleri ve geçiş kurallarını kodla (§6.1):

| Durum | İzin Verilen Sonraki Durumlar |
|-------|-------------------------------|
| Kabul Edildi | Teşhis Bekleniyor, Teşhis Tamamlandı, İptal Edildi |
| Teşhis Bekleniyor | Teşhis Tamamlandı, İptal Edildi |
| Teşhis Tamamlandı | Müşteri Onayı Bekleniyor, İşlemde, Parça Bekleniyor, İptal Edildi |
| Müşteri Onayı Bekleniyor | İşlemde, Parça Bekleniyor, Teşhis Tamamlandı, İptal Edildi |
| İşlemde | Parça Bekleniyor, Müşteri Onayı Bekleniyor, İş Tamamlandı, İptal Edildi |
| Parça Bekleniyor | İşlemde, İptal Edildi |
| İş Tamamlandı | Teslim Edildi, İşlemde (yeniden açma; neden zorunlu), İptal Edildi |
| Teslim Edildi | İşlemde (yeniden açma; neden zorunlu) — iptal edilemez |
| İptal Edildi | Terminal durum |

- [x] Geçersiz geçiş denemesinde hata mesajı gösterilir
- [x] Her durum değişikliği `ServiceStatusHistory`'e yazılır: from_status, to_status, changed_at, actor_id, device_id, note
- [x] Yeniden açma neden zorunludur

> Uygulandı: `src/lib/services/status.ts` (saf durum makinesi, 28 test), servis detayında yalnızca izinli geçiş düğmeleri; iptal ve yeniden açma neden ister ve audit log'a yazılır. Durum geçmişi değiştirilemez (migration 013 kuralları) ve servis sayfasında görünür. `first_completed_at` yeniden açılsa da korunur (SR-009). **Açık:** onay eşiği kontrolü (3.8), tamamlama/teslim kuralları: fiyatı beklenen kalem, kalan bakiye gösterimi, borçlu teslim (3.12).

**İlgili FR:** FR-008  
**İlgili AC:** AC-017, AC-033  
**Test:** TC-019, TC-034

**Kabul kriteri:**
- Geçersiz geçiş engellenir; yeniden açılan servis sayacı ikinci kez artırmaz.

---

### ADIM 3.8 — Müşteri Onay Sistemi

**Görevler:**
- [x] `ServiceApproval` tablosu: decision, method, approved_amount, decided_at, explanation
- [x] Onay eşiği kontrolü (SR-004):
  - Eşik = BusinessSettings.approval_threshold_amount (varsayılan 1.000 ₺)
  - 0 = her ücretli işte onay
  - Onay gereken serviste onay kaydı olmadan "Teşhis Tamamlandı" → "İşlemde" geçişi engellenir
- [x] Teklif tutarı artar → yeni onay gerekir → servis "Müşteri Onayı Bekleniyor"a alınır (SR-005)
- [ ] Onaylananın üstünde işlem yapılmaz; ayarlanabilir tolerans (varsayılan 0)
- [x] Onay yöntemi: yüz yüze / telefon / diğer
- [x] Her kalem: onaylandı / reddedildi / ertelendi (SR-006)
- [x] Reddedilen/ertelenen kalem toplam tutara girmez (TC-004)

> Uygulandı: migration 014, `src/lib/services/lines.ts` (saf teklif özeti ve eşik kuralı), `quote.ts` (`recordApproval`, `refreshServiceTotals` ile otomatik "Müşteri onayı bekleniyor"), servis sayfasında "Müşteri kararını kaydet" formu ve onay geçmişi. Onay kaydı değiştirilemez tabloya yazılır. **Açık:** "Onaylananın üstünde işlem yapılmaz; ayarlanabilir tolerans" (şimdilik tolerans 0 sabit: onaylı kalemin tutarı artarsa yeniden onay bekler); eşik ve negatif stok için ayarlar ekranı.

**İlgili FR:** FR-032  
**İlgili AC:** AC-004, AC-042  
**Test:** TC-005, TC-043, TC-055

---

### ADIM 3.9 — İşlem ve Parça Satırları

**Görevler:**
- [x] `ServiceOperation` satırları:
  - Katalogdan seçim veya serbest metin
  - Önerilen fiyat otomatik dolar; değiştirilebilir
  - İşçilik tutarı, indirim, vergi modu/oranı, satır toplamı
  - Onay durumu (onaylandı / reddedildi / ertelendi)
  - Fiyat bilinmiyorsa `price_status = PENDING` işareti (SR-007)
- [x] `ServicePart` satırları:
  - Stok ürünü (product_id) veya serbest (product_id boş)
  - source_type: STOCK_PRODUCT / CUSTOMER_SUPPLIED / NON_STOCK_PURCHASE / OTHER
  - Müşteri getirdiği parça: stok düşülmez, müşteriye parça bedeli yazılmayabilir (§7.1)
  - quantity, used_quantity, returned_quantity, supply_status
  - supply_status: IN_STOCK / TO_ORDER / ORDERED / ARRIVED (SR-019)
  - Snapshot: description_snapshot, unit_price_snapshot, unit_cost_snapshot
- [x] Stok düşümü: `ServicePart.used_quantity > 0` olduğunda (SR-008)
- [x] Teklif aşamasında stok değişmez (TC-006)
- [x] Bir serviste birden fazla arıza, işlem ve parça olabilir (SR-003)

> Uygulandı: `quote.ts` (`addOperation/updateOperation/removeOperation`, `addPart/updatePart/removePart`, `setPartUsedQuantity`), `ServiceLines.tsx`. Parça kullanımı `SERVICE_USE` stok hareketi + maliyet snapshot'ı üretir (AC-050), geri alma `CANCEL_REVERSAL` ile ve nedenle yapılır; kaynak türleri: stok ürünü / müşterinin getirdiği / stok dışı alım / diğer. Fiyatı belirsiz kalem (`price_pending`) "İş tamamlandı"yı engeller (SR-007). **Açık:** arıza/işlem kataloğu ve önerilen fiyatlar (3.5), `ServiceIssue` tablosu (şikâyet şimdilik metin), parça temin takibi ekranı (3.14).

**İlgili AC:** AC-006, AC-007  
**Test:** TC-006, TC-007

---

### ADIM 3.10 — Şablon ve Kontrol Listesi

**Görevler:**
- [x] Şablon uygulandığında her madde `ServiceChecklistItem` kaydı olarak kopyalanır
- [x] Şablon sonradan değişse açık servislerdeki kopya değişmez (AC-005)
- [x] Madde alanları: başlık, sıra, zorunlu/isteğe bağlı, tamamlandı durumu, tamamlayan kullanıcı/cihaz, zaman
- [x] Kullanıcı serviste adım ekleyebilir, kaldırabilir, tamamlandı işaretleyebilir
- [x] Zorunlu madde tamamlanmadan "İş Tamamlandı" geçişinde uyarı

> Uygulandı: `services/checklist.ts`, **Ayarlar → Servis şablonları**, servis sayfasında **Kontrol listesi** (şablon uygula, madde ekle/kaldır/tamamla, kim-hangi cihaz-ne zaman kaydı). Zorunlu madde açıkken “İş tamamlandı” geçişinde `ChecklistIncompleteError` uyarısı çıkar, kullanıcı “Yine de tamamla” diyebilir.

**İlgili FR:** FR-009  
**Test:** TC-008

---

### ADIM 3.11 — Garanti İşlemleri

**Görevler:**
- [x] `ServiceOrder.warranty_claim` bayrağı
- [x] Garanti kaynağı ve kapsam açıklaması alanları
- [x] Makine kartındaki garanti bitiş tarihi bilgi amaçlı gösterilir; kapsam kullanıcı tarafından doğrulanır
- [x] Garanti kapsamında müşteri ücreti sıfır olabilir
- [x] Kullanılan parça stok çıkışı ve unit_cost_snapshot yine kaydedilir (SR-011)
- [x] Kapora: servis kabulünde alınan ön ödeme; service_order_id bağlı Payment kaydı (SR-018)

> Uygulandı: servis kabulünde ve servis bilgilerinde **Garanti talebi** (kaynak + kapsam), makine kartında garanti bitiş tarihi (bilgi amaçlı, kapsamı kullanıcı doğrular), fişte “Garanti kapsamında” satırı. Garanti kalemleri 0 ₺ girilebilir; kullanılan parça yine stoktan düşer ve maliyet kaydı tutulur (SR-011). Kapora zaten servise bağlı ödeme (SR-018).

**İlgili AC:** AC-009 (garanti fişi TC-009)  
**Test:** TC-009

---

### ADIM 3.12 — Servis Tamamlama ve Teslim

**Görevler:**
- [x] "İş Tamamlandı" geçişi: fiyatı beklenen ücretli kalem varsa geçiş engellenir (SR-007)
- [x] Servis sayacı: `ServiceOrder.first_completed_at` dolu + iptal edilmemiş servisler (SR-009)
- [x] Yeniden açma sayaçta ikinci artış oluşturmaz
- [x] İptal edilen servis sayaçtan düşer; geçmişi korunur
- [x] **Teslim akışı (§5.2):**
  - Teslim anında kalan bakiye açıkça gösterilir
  - Borçlu teslim mümkündür; bakiye ve müşterinin borç kabulü kaydedilir (AC-025)
  - Teslim alan kişi (müşteri değilse adı) kaydedilir
  - Ödeme ve teslim kayıtları oluşturulur
- [x] Teslim edilmiş servis iptal edilemez (AC-033)

> Uygulandı: migration 015 (`delivered_to`, `delivery_balance`, `debt_acknowledged`), `deliverService`, `getServiceBalance`, `collectServicePayment` (`service.ts`); servis sayfasında **Ödemeler** (toplam / tahsil edilen / kalan, tahsilat alma) ve **Teslim et** paneli. Borçlu teslim, müşteri borcu kabul edilmeden yapılamaz; tahsilat ve teslim tek işlemdir. Ek kural (K-023): stoktan faturalanan parça "kullanıldı" işaretlenmeden iş tamamlanamaz.

**İlgili AC:** AC-017, AC-025, AC-033  
**Test:** TC-010, TC-019, TC-034

---

### ADIM 3.13 — Servis İptali

**Görevler:**
- [x] Servis iptali: gerekçe + onay zorunlu (SR-017)
- [x] Kullanılmış parça stoğu otomatik geri eklenmez; fiziksel durum ayrıca değerlendirilir
- [ ] İsteğe bağlı "inceleme/teşhis ücreti" kalemi eklenebilir; servis iptal olarak kalır; sayaç artmaz
- [x] Alınmış ön ödeme/kapora: iade edilir veya müşteri alacağına yazılır (§9.7) — tutar müşteri alacağı olarak kalır, iade "Müşteriye ödeme" ile; iptal ekranı bunu hatırlatır
- [x] Teslim edilmiş servis iptal edilemez → ücret düzeltmesi iade akışıyla yapılır

**İlgili SR:** SR-017  
**Test:** TC-034, TC-056

---

### ADIM 3.14 — Parça Temin Durumu (Parça Bekleniyor)

**Görevler:**
- [x] `ServicePart.supply_status`: IN_STOCK / TO_ORDER / ORDERED / ARRIVED
- [x] TO_ORDER veya ORDERED parça olan serviste "Parça Bekleniyor" durumunda kalabilir
- [x] Beklenen tarih (expected_at) ve isteğe bağlı sipariş/satın alma kalemi bağlantısı
- [x] Tüm parçalar ARRIVED/IN_STOCK olunca bekleme bildirimi çözülür (SR-019)

> Uygulandı: `setPartSupply` (`services/quote.ts`), parça satırında temin durumu + beklenen tarih seçimi, `PART_WAITING` bildirimi (parça gelince çözülür). **Not:** sipariş/satın alma kalemi bağlantısı ileriye bırakıldı (isteğe bağlı madde); durum “Parça bekleniyor”a geçişi kullanıcı kararıdır.

---

### ADIM 3.15 — Servis Fişleri ve Yazdırma

**Görevler:**
- [x] **Servis kabul fişi:** İşletme adı/telefon/logo, servis no/tarih, müşteri, makine, teslim alınan aksesuarlar, mevcut hasar, şikâyet, teslim koşulları (alt metin ayardan)
- [x] **Servis sonuç özeti:** İşletme adı/telefon, servis no/tarih, müşteri/makine/seri veya iç numara, şikâyet ve yapılan iş özeti, toplam, tahsil edilen, kalan bakiye, durum, teslim bilgisi
- [x] Dahili parça maliyetleri ve maliyet snapshot'ı müşteri çıktısında görünmez (AC-034)
- [x] Kâğıt biçimi: A4 + dar fiş; PDF kaydetme alternatifi
- [x] Çıktılar resmî fatura olarak adlandırılmaz

> Uygulandı: `src/lib/services/receipt.ts` (müşteriye gösterilecek saf model; maliyet alanı modelde yok), `ReceiptView.tsx`, `/services/[id]/receipt?type=intake|summary`, servis sayfasında "Kabul fişi" / "Sonuç özeti" düğmeleri. A4 ve dar fiş (72 mm) önizlenir; "Yazdır / PDF kaydet" tarayıcının yazdır penceresini açar (K-024). Alt metin `business.settings.receipt_terms` ile değiştirilebilir (ayar ekranı sonra). **Açık:** işletme logosu (logo altyapısıyla), fişe QR kod (3.4).

**İlgili FR:** FR-010  
**İlgili AC:** AC-034  
**Test:** TC-035

---

### ADIM 3.16 — Servis Teslim Tarihi Hatırlatmaları

**Görevler:**
- [x] Teslim tarihi yaklaşma bildirimi: varsayılan 1 gün önce
- [x] Gecikme durumunda teslim kaydı oluşana kadar günde bir kez bildirim
- [x] Ana ekran "Teslim tarihi yaklaşan/geçen" metriği
- [ ] Ayarlardan hatırlatma günü değiştirilebilir (SR-014)

> Uygulandı: `notifications/serviceReminders.ts` (planlayıcı + `syncServiceNotifications`), gecikmede günde bir yeni bildirim (eskisi çözülür), teslim/iptalde hepsi çözülür; ana ekran kutuları. **Açık:** hatırlatma gününü değiştiren ayar ekranı (Ayarlar sayfasıyla, SR-014; değer `business.settings.default_service_reminder_days` olarak okunur).

**İlgili AC:** AC-038

---

### ADIM 3.17 — Servis Ekranı (UI)

**Görevler:**
- [x] Servis listesi: aktif / tamamlanmış / iptal edilmiş sekmeleri; durum rozeti, vaat edilen teslim tarihi, bakiye göstergesi
- [ ] Servis detayı sekmeleri:
  - Özet (müşteri, makine, durum, tarihler)
  - Arıza ve teşhis
  - İşlemler ve parçalar
  - Onaylar
  - Kontrol listesi
  - Ödemeler
  - Geçmiş (durum geçmişi ve audit)
- [x] Ana ekran metrikleri: Aktif Servis, Onay Bekleyen, Parça Bekleyen, Teslim Tarihi Yaklaşan/Geçen

> Uygulandı: servis listesinde aktif/teslim/iptal sekmeleri, rozet, teslim sözü, kalan bakiye; ana ekranda Aktif, Onay bekleyen, Parça bekleyen, Teslimi yaklaşan/geçen. **Açık:** detay ekranının sekmeli düzeni (şu an tek sayfada bölümler halinde) ve kontrol listesi bölümü (3.10 ile).

---

## FAZ 3 Tamamlanma Kriterleri

| # | Kriter | AC/TC Referansı |
|---|--------|----------------|
| 1 | Mevcut müşteri ve makineyle servis 30 sn'de açılıyor | AC-001, TC-001 |
| 2 | Yeni müşteri + makine + servis tek akışta bağlanıyor | AC-002, TC-002 |
| 3 | QR ile makine açılıyor; oturumsuz giriş isteniyor | AC-003, TC-003 |
| 4 | Reddedilen işlem toplam ve stok tüketimine girmiyor | AC-004, TC-004 |
| 5 | Teklif arttığında eski onay yeni tutarı kapsamıyor | AC-042, TC-005 |
| 6 | Şablon kopyalanıyor; şablon değişince kopya sabit kalıyor | AC-005, TC-008 |
| 7 | Garanti işinde müşteri ücreti sıfır; parça çıkışı var | TC-009 |
| 8 | Borçlu teslimde bakiye gösterilip kaydediliyor | AC-025, TC-010 |
| 9 | Durum geçmişi kayıt altına alınıyor | AC-017, TC-019 |
| 10 | Teslim edilmiş servis iptal edilemiyor | AC-033, TC-034 |
| 11 | Fiş iç maliyetleri göstermiyor | AC-034, TC-035 |

---

## Sonraki Faz

[FAZ 4 — Ticaret Modülü →](./04_FAZ4_TICARET.md)
