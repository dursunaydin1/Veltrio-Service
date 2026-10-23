# FAZ 5 — Finans & İade

> PRD §20 Faz 5 | Önkoşul: FAZ 1-4 tamamlanmış olmalı

---

## Amaç

Veresiye yönetimi, vade takibi, açılış bakiyeleri, müşteri/tedarikçi iadeleri ve tüm iptal/düzeltme akışlarını hayata geçirmek.

---

## Adım Adım İşlem Basamakları

### ADIM 5.1 — Veresiye ve Tahsilat Ayrımı

**Görevler:**
- [ ] Veresiye = tahsil edilmemiş alacak durumu; ödeme yöntemi değildir (§9.4)
- [ ] 'Veresiye' seçimi Payment kaydı yaratmaz; satış bakiyesini açık bırakır
- [ ] Payment.method sadece: CASH / CARD / BANK_TRANSFER / OTHER
- [ ] CREDIT/VERESIYE geçerli tahsilat yöntemi değildir
- [ ] Satışın toplamı, fiilen tahsil edilen ödeme hareketleri ve kalan alacak ayrı tutulur
- [ ] Veresiye tutarı tahsilat raporuna girmez (AC-010)

**Test:** TC-042 (müşteri seçmeden veresiye engeli)

---

### ADIM 5.2 — Ödeme Tahsis Sistemi (PaymentAllocation)

**Görevler:**
- [ ] Belgeden alınan ödeme otomatik o belgeye tahsis edilir
- [ ] Kısmi ödeme: bir veya birden fazla Payment kaydı
- [ ] **Belgesiz genel tahsilat** müşteri profilinden alınabilir:
  - Varsayılan tahsis sırası: en eski açık kalemden başlar (FIFO)
  - Vade tarihi varsa vadeyee, yoksa belge tarihine göre sıralama
  - Açılış bakiyesi as_of_date'ine göre sıralanır
  - Kullanıcı tahsis önizlemesinde belgeleri elle değiştirebilir (AC-040)
- [ ] **Fazla ödeme:** Belgelere dağıtılamayan kısım müşteri alacağı (avans) olarak kalır
  - Sonraki borçlara kullanıcı onayıyla mahsup edilir (AC-040)
- [ ] Kalan bakiye = belge toplamı − belgeye tahsis edilmiş geçerli ödemeler ± finansal düzeltmeler
- [ ] Hatalı ödeme silinmez; ters Payment (REVERSED, reversal_of_id) ile düzeltilir

**İlgili FR:** FR-017  
**İlgili AC:** AC-010, AC-011, AC-040, AC-046  
**Test:** TC-041

---

### ADIM 5.3 — Vade Takibi

**Görevler:**
- [ ] Vade tarihi Payment'ta isteğe bağlı alan
- [ ] Vade girilmezse hatırlatma oluşturulmaz
- [ ] Vade hatırlatması uygulama içi bildirim:
  - Vade gününde bir kez
  - Gecikme 7 günü aşınca bir kez daha (§9.4)
- [ ] Müşteri yaşlandırma bantları (§15): 0–7 gün, 8–30 gün, 31–60 gün, 60+ gün
  - Yalnızca müşteri borcu olan (pozitif bakiye) açık kalemler için
  - Vade tarihi varsa vadeye, yoksa belge tarihine göre
  - Müşteri alacakları ayrı gösterilir (AC-046)

---

### ADIM 5.4 — Açılış Bakiyeleri (OpeningBalance)

**Görevler:**
- [ ] `OpeningBalance` tablosu: id, business_id, party_type (CUSTOMER/SUPPLIER), party_id, direction (OWED_BY_PARTY / OWED_TO_PARTY), amount, as_of_date, source_note, import_batch_id
- [ ] Sahte satış/ödeme kaydı yaratılmaz; OpeningBalance olarak tutulur
- [ ] OWED_BY_PARTY: taraf işletmeye borçlu (müşteri borcu)
- [ ] OWED_TO_PARTY: işletme tarafa borçlu (tedarikçi borcu veya müşteri alacağı)
- [ ] Açılış bakiyesi değişikliği kritik işlem onayı gerektirir
- [ ] Bakiye hesabında açılış bakiyesi başlangıç noktası olarak dahil edilir

**İlgili FR:** FR-016

---

### ADIM 5.5 — Müşteri Ürün İadesi

**Görevler:**
- [x] `ReturnTransaction` tablosu: id, business_id, document_no, original_type, original_id, return_date, reason, refund_method, total_amount, status (POSTED/REVERSED), created_by_device
- [x] `ReturnItem` tablosu: original_line_type, original_line_id, product_id, serial_unit_id, quantity, unit, amount, stock_disposition (SELLABLE/DAMAGED/NOT_RETURNED), stock_movement_id
- [x] Orijinal satış ve satır referansı zorunludur (§9.7)
- [x] Tam/kısmi miktar; daha önce iade edilmiş miktar toplamı aşamaz (AC-012)
- [x] **Ürün durumu:**
  - SELLABLE → AVAILABLE stoğa döner
  - DAMAGED → DAMAGED bucket'ına yazılır; kritik stok hesabına dahil edilmez
  - NOT_RETURNED → stok hareketi yok
- [x] **Para iadesi seçenekleri (kullanıcı açıkça seçer):**
  - Nakit/kart/banka → Payment (direction=OUT)
  - Müşteri alacağı (CUSTOMER_CREDIT) → bakiyeye yazılır
  - Aynı tutar hem nakit hem müşteri alacağı olarak çift sayılmaz
- [x] İade kaydı silinmez; hatalı iade için ters iade hareketi + audit log
- [x] Belge numarası: `IAD-[cihaz_kodu]-[yıl]-[sıra]`

> Uygulandı: migration 019 (`refund_payment_id`, `reversal_reason`), `src/lib/returns/service.ts` (`createSaleReturn`, `reverseSaleReturn`), satış detayında **Ürün iadesi** paneli (K-031). Müşteri bakiyesi ve satış bakiyesi iadeleri düşer. **Açık:** servis parçası ve satın alma iadesi (5.6/5.7); makine iadesi geri alınamaz (yeniden satış yapılır).

**İlgili FR:** FR-018, FR-019  
**İlgili AC:** AC-012, AC-043, AC-046  
**Test:** TC-014

---

### ADIM 5.6 — Tedarikçiye İade

**Görevler:**
- [x] Orijinal satın alma satırına bağlanır (§9.7)
- [x] Miktar, tutar, stok çıkışı (DAMAGED bucket veya AVAILABLE) ve tedarikçi bakiyesi etkisi kaydedilir
- [x] Stok çıkışı: StockMovement (DAMAGED_DISPOSE veya özel iade türü)
- [x] Tedarikçi bakiyesi güncellenir

> Uygulandı: `src/lib/returns/purchase.ts` (`createPurchaseReturn`), alım detayında **Tedarikçiye iade** paneli, tedarikçi bakiyesi ve alımın kalan borcu iadeleri düşer (K-032). Geri alma `reverseReturn` ile satış iadesiyle ortaktır.

**İlgili AC:** AC-013  
**Test:** TC-015

---

### ADIM 5.7 — Servis Ücret İadesi ve Düzeltmesi

**Görevler:**
- [ ] **Teslim öncesi servis iptali (SR-017):**
  - Alınmış ödeme ve kapora → ters finans hareketi ile iade edilir veya müşteri alacağına yazılır
  - Kullanılmış parça stoğu otomatik geri eklenmez
- [ ] **Teslim sonrası ücret düzeltmesi:**
  - Teslim edilmiş servis iptal edilemez
  - ReturnTransaction (original_type = SERVICE) ile işlenir
  - İade edilecek kalemler ve tutar belirtilir
  - Gerekirse parça iadesi stok durumuyla kaydedilir

**İlgili AC:** AC-014, AC-033  
**Test:** TC-016, TC-056

---

### ADIM 5.8 — Bakiye Raporlama Ekranı

**Görevler:**
- [ ] Müşteri profili: toplam bakiye, belge bazlı açık tutarlar, ödeme geçmişi
- [ ] Yaşlandırma bantları görüntüleme: 0–7, 8–30, 31–60, 60+ gün
- [ ] Müşteri alacakları ayrı bölümde
- [ ] Tedarikçi profili: açılış bakiyesi, satın alma toplamı, ödeme toplamı, iadeler, kalan borç
- [ ] Müşteri bakiyeleri listesi raporu (tüm müşteriler)
- [ ] Tedarikçi bakiyeleri listesi raporu

---

### ADIM 5.9 — Servis Fişinde Bakiye Gösterimi

**Görevler:**
- [x] Servis kabul fişi ve sonuç özeti ödemeler bölümü:
  - Toplam tutar
  - Tahsil edilen (kapora dahil)
  - Kalan bakiye
- [x] Borçlu teslimde kalan bakiye açıkça gösterilir (AC-025)

---

## FAZ 5 Tamamlanma Kriterleri

| # | Kriter | AC/TC Referansı |
|---|--------|----------------|
| 1 | Veresiye tutarı tahsilat raporuna girmiyor | AC-010 |
| 2 | Kısmi ödeme sonrası bakiye doğru | AC-011 |
| 3 | Belgesiz tahsilat en eski kalemden tahsis ediliyor; fazla tutar müşteri alacağı oluyor | AC-040, TC-041 |
| 4 | Müşteri ürün iadesi: kısmi miktar, para/alacak seçimi, stok durum ayrı kaydediliyor | AC-012, TC-014 |
| 5 | Tedarikçi iadesi orijinal satın almaya bağlanıyor; stok ve bakiye doğru | AC-013, TC-015 |
| 6 | Servis ücret iadesi geçmiş ödemeyi silmiyor; ters hareket üretiyor | AC-014, TC-016 |
| 7 | DAMAGED iade satılabilir stoğa girmiyor; müşteri alacağı bakiyeyi negatife alıyor | AC-043, AC-046 |
| 8 | Yaşlandırma bantları yalnızca borç kalemlerini içeriyor | AC-046, TC-047 |
| 9 | Borçlu servis tesliminde kalan bakiye gösterilip kaydediliyor | AC-025, TC-010 |

---

## Sonraki Faz

[FAZ 6 — İçe/Dışa Aktarma & Raporlar →](./06_FAZ6_RAPOR_IMPORT.md)
