# FAZ 4 — Ticaret Modülü

> PRD §20 Faz 4 | Önkoşul: FAZ 1 + FAZ 2 tamamlanmış olmalı (FAZ 3 ile paralel çalışılabilir)

---

## Amaç

Ürün satışı, makine satışı ve satın alma akışlarını hayata geçirmek. Seri numarası takipli makine satışı dahil.

---

## Adım Adım İşlem Basamakları

### ADIM 4.1 — Hızlı Satış

**Görevler:**
- [x] `Sale` tablosunu oluştur:
  - id, business_id, document_no, customer_id (nullable), sale_date
  - subtotal, discount_total, tax_total, total_amount
  - status (DRAFT / FINAL / CANCELLED), cancel_reason
- [x] `SaleItem` tablosunu oluştur:
  - id, business_id, sale_id, product_id, serial_unit_id (nullable), machine_id (nullable)
  - description_snapshot, quantity, unit, unit_price_snapshot, unit_cost_snapshot
  - discount_amount, tax_mode, tax_rate, line_total, stock_movement_id
- [x] Hızlı satış akışı (§5.3):
  1. Ürün ve miktar seçimi
  2. İndirim (isteğe bağlı)
  3. Ödeme yöntemi ve alınan tutar
  4. Tahsil edilmemiş tutar varsa → müşteri seçimi zorunlu (AC-041)
  5. Hızlı satış tek adımda FINAL olur
- [x] Müşteri seçilmeden veresiye satış engellemesi (AC-041, TC-042)
- [x] Satış kesinleştiğinde stok düşümü (ST-006)
- [x] Belge numarası: `SAT-[cihaz_kodu]-[yıl]-[sıra]`

> Uygulandı: migration 017 (`notes`, `finalized_at`), `src/lib/sales/service.ts` (`createSale`, `finalizeSale`, `collectSalePayment`, `getSaleBalance`), `/sales/new` (hızlı satış ekranı: ürün ekle, indirim, müşteri (isteğe bağlı), ödeme, "Satışı tamamla"). Müşterisiz satışta tahsil edilmeyen tutar engellenir; fazla tahsilat kabul edilmez; ödeme müşterisiz belgeye bağlanabilir (`recordDocumentPayment`).

**İlgili FR:** FR-014  
**İlgili AC:** AC-041

---

### ADIM 4.2 — Detaylı Satış

**Görevler:**
- [x] Taslak (DRAFT) olarak kaydedilebilir; stok/finans etkisi yoktur (ST-006)
- [x] Ayrıntılı satış: her ürün/miktar/indirim/vergi satırı
- [x] Ondalıklı birimli ürün satışı desteklenir (TC-013)
- [x] Satış FINAL olunca stok düşümü ve ödeme kaydı oluşur
- [x] KDV: INCLUSIVE / EXCLUSIVE / NONE; belge ve satır bazında
- [x] İndirim: satır bazlı + belge genelinde; negatif olamaz
- [x] Belge genelindeki indirim hangi satırlara dağıtıldığı kayıt altında

> Uygulandı: tutarlar `computeSaleTotals` ile (ekran önizlemesi ve servis aynı fonksiyonu kullanır); belge indirimi satırların indirim sonrası tutarına orantılı dağıtılıp satırın `discount_amount` alanına yazılır (K-027). Eksi stoğa izin veren işletmede stok yetersizse neden istenir (ST-004). **Açık:** makine (seri takipli) satışı ve seri birim seçimi (4.3).

**İlgili PRD:** §9.2

---

### ADIM 4.3 — Makine Satışı (Seri Takipli)

**Görevler:**
- [x] Seri takipli makine satışında stoktaki belirli bir ProductSerialUnit seçilir
- [x] Satış kesinleştiğinde:
  - Seçilen birim → SOLD durumuna geçer
  - İlgili Machine kaydı müşteriyle ilişkilendirilir
- [x] Makine kaydı satıştan önce mevcutsa aynı kayıt kullanılır; çift kayıt oluşturulmaz (§5.3)
- [x] Seri numarası olmayan makinelerde birim kaydı yine oluşur; sistem iç numara üretir
- [x] Aynı birim iki kez satılamaz; çevrimdışı çift satış eşitlemede çakışma kuyruğuna düşer (AC-039, TC-040)

> Uygulandı: `sellSerialUnit` (`sales/service.ts`), satış formunda birim seçimi, makine sayfasında satış bilgisi. Müşteri zorunlu; makine kaydı müşteriye aitse yeniden kullanılır, başka müşteriye aitse sahiplik geçmişe yazılarak devredilir, yoksa açılır (K-028). Birim maliyeti birimin alış hareketinden alınır. **Açık (AC-039/TC-040):** iki cihazın çevrimdışı aynı birimi satması durumunda eşitlemedeki çakışmanın kullanıcıya gösterilmesi ve çözümü (çakışma ekranı, Faz 2.10/6.7); birim durum güncellemesi sürüm kontrolüyle zaten reddedilir.

> Not: aynı cihazda / çevrimiçi çift satış engellenir (testli); çevrimdışı çift satışın eşitlemede çakışma kuyruğuna düşme kısmı yukarıdaki açık maddedir.

**İlgili FR:** FR-014, FR-029  
**İlgili AC:** AC-027, AC-039  
**Test:** TC-028, TC-040

**Kabul kriteri:**
- Makine satışı stoktaki doğru seri numaralı birimi düşer ve Machine kaydını müşteriyle ilişkilendirir (AC-027).

---

### ADIM 4.4 — Satış İptali

**Görevler:**
- [x] Kesinleşmiş satış: gerekçe + onay ile iptal edilebilir (§9.6)
- [x] İptal işlemi:
  - Ürün AVAILABLE stoğa döner
  - Seri birim → IN_STOCK olur
  - Ödemeler ters kaydı veya müşteriye para iadesi
  - Makine satışıysa makine-müşteri ilişkisi geri alınır (sahiplik geçmişine yazılır)
- [x] İptal ≠ iade (fiziksel ürünün geri gelmesi değil, hatalı kayıt düzeltmesi)
- [ ] Raporlarda ayrı görünür; net toplamdan düşer; belge silinmez (AC-044)

> Uygulandı: `cancelFinalSale` (`sales/service.ts`) ve satış detayında “Satışı iptal et”. Stok ters hareketle (CANCEL_REVERSAL, `reversal_of_id`) döner, seri birim IN_STOCK olur, tahsilatlar ters ödemeyle iade edilir; makine satışında devralınan makine eski sahibine döner (geçmişe yazılır), satışla açılmış servissiz makine arşivlenir. Onay adımı tek kullanıcılı olduğundan nedenin yazılması ve açık onay ekranı yeterli sayıldı (K-030). **Açık:** raporlarda iptallerin ayrı görünmesi (Faz 6).

**İlgili FR:** FR-037  
**İlgili AC:** AC-044  
**Test:** TC-045

---

### ADIM 4.5 — Tedarikçi Yönetimi

**Görevler:**
- [x] `Supplier` tablosu: id, business_id, name, phone, address, notes, archived_at
- [x] Tedarikçi profili: satın alma geçmişi, yapılan ödemeler, iadeler, açılış bakiyesi, kalan borç
- [x] Tedarikçi bakiyesi hesabı (§9.3)
- [x] Tedarikçi arşivleme

> Uygulandı: `src/lib/suppliers/` (şema, servis), `/suppliers`, `/suppliers/new`, `/suppliers/[id]`; müşteri ve tedarikçi için ortak `PartyBalancePanel`. Bakiyesi sıfır olmayan tedarikçi arşivlenemez. **Açık:** tedarikçi profilinde satın alma geçmişi ve iade listesi (satın alma ve Faz 5 ile).

**İlgili PRD:** §4.6, §9.3

---

### ADIM 4.6 — Satın Alma

**Görevler:**
- [x] `Purchase` tablosu: id, business_id, document_no, supplier_id, purchase_date, total_amount, status, notes
- [x] `PurchaseItem` tablosu: product_id, description_snapshot, quantity, unit, unit_price, line_discount, tax_mode, tax_rate, line_total, stock_movement_id
- [x] **Hızlı satın alma:**
  - Tedarikçi, tarih, toplam, ödenen tutar, kısa açıklama
  - Stok etkisi için ürün + miktar satırları zorunlu
  - Yalnızca toplam tutarlı kayıt stok miktarını değiştirmez; "stok girişi yapılmadı" uyarısı (§9.5)
- [x] **Ayrıntılı satın alma:**
  - Her ürün/miktar/birim fiyat/indirim satırı
  - Seri takipli ürünlerde seri numaraları girilebilir
- [x] Kayıt RECEIVED olunca:
  - Stok artar (StockMovement: PURCHASE_IN)
  - Son alış fiyatı güncellenir (Product.last_purchase_price)
  - Seri takipli ürünlerde ProductSerialUnit kayıtları oluşur
- [x] DRAFT belge stok hareketi üretmez (ST-006)
- [x] Belge numarası: `AL-[cihaz_kodu]-[yıl]-[sıra]`
- [x] KDV bilgisi yalnızca bilgi amaçlı; indirilecek KDV hesabı yapılmaz

> Uygulandı: migration 016 (`supplier_ref`, `received_at`, `cancel_reason`), `src/lib/purchases/service.ts` (`createPurchase`, `updateDraftPurchase`, `receivePurchase`, `cancelDraftPurchase`, `payPurchase`, `getPurchaseBalance`), `/purchases`, `/purchases/new`, `/purchases/[id]`, tedarikçi sayfasında alım geçmişi. Teslim alma: PURCHASE_IN hareketi + ürünün son alış fiyatı + tedarikçi borcu, tek işlemde. Seri takipli ürün alımı da desteklenir: her adet ayrı birim olur, seri numaraları satırda girilir (K-028).

**İlgili FR:** FR-015  
**İlgili AC:** AC-007

---

### ADIM 4.7 — Tedarikçi Borç Takibi

**Görevler:**
- [x] Tedarikçi bakiyesi = açılış bakiyesi + RECEIVED satın alma tutarları - tedarikçiye ödemeler - tedarikçi iadeleri + tedarikçiden alınan iadeler
- [x] Tedarikçiye ödeme: Payment (direction=OUT, supplier_id dolu)
- [x] Borç azaltma ödeme hareketiyle olur
- [x] Tedarikçi borcu raporlanır (§15)

> Uygulandı: `calcSupplierBalance` (kuruş), `getSupplierBalance`, `recordSupplierPayment`, ters kayıt müşteriyle ortak. Tedarikçi iadeleri Faz 5'te formüle eklenecek. **Açık:** tedarikçi borç raporu (Faz 6).

---

### ADIM 4.8 — Satış Ekranı (UI)

**Görevler:**
- [x] Satışlar sekmesi: hızlı satışlar, makine satışları, taslaklar, tahsilatlar, satış geçmişi
- [x] Taslak listesi ve taslak düzenleme
- [x] Satış detayı görüntüleme
- [x] Satış iptal akışı ekranı
- [x] Ödeme ekleme ekranı: birden fazla ödeme yöntemi, kısmi tahsilat

> Uygulandı: `/sales` (Satışlar / Taslak / İptal sekmeleri ve arama), `/sales/new`, `/sales/[id]` (kalemler, taslak işlemleri, tahsilat ve geçmişi, iade, iptal). Birden fazla yöntem, ayrı tahsilat kayıtlarıyla desteklenir. **Not:** makine satışları ayrı sekme değil; satır, makine olarak satış detayında görünür.

---

## FAZ 4 Tamamlanma Kriterleri

| # | Kriter | AC/TC Referansı |
|---|--------|----------------|
| 1 | Hızlı satış tek adımda FINAL oluyor | FR-014 |
| 2 | Müşteri seçilmeden veresiye satış engellenyor | AC-041, TC-042 |
| 3 | Ondalıklı misina/litre satışı doğru hesaplanıyor | TC-013 |
| 4 | Makine satışında doğru seri birim düşülüyor; makine müşteriyle bağlanıyor | AC-027, TC-028 |
| 5 | Aynı seri birim iki kez satılamıyor; çevrimdışı çift satış çakışmaya düşüyor | AC-039, TC-040 |
| 6 | Satış iptali ters stok + ters ödeme üretiyor; raporlarda ayrı görünüyor | AC-044, TC-045 |
| 7 | Satın alma RECEIVED olunca stok artıyor; son alış fiyatı güncelleniyor | ST-006 |
| 8 | DRAFT satış stok/finans hareketi üretmiyor | ST-006 |
| 9 | Tedarikçi bakiyesi doğru hesaplanıyor | §9.3 |

---

## Sonraki Faz

[FAZ 5 — Finans & İade →](./05_FAZ5_FINANS_IADE.md)
