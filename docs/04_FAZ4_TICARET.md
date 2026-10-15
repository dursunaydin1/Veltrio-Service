# FAZ 4 — Ticaret Modülü

> PRD §20 Faz 4 | Önkoşul: FAZ 1 + FAZ 2 tamamlanmış olmalı (FAZ 3 ile paralel çalışılabilir)

---

## Amaç

Ürün satışı, makine satışı ve satın alma akışlarını hayata geçirmek. Seri numarası takipli makine satışı dahil.

---

## Adım Adım İşlem Basamakları

### ADIM 4.1 — Hızlı Satış

**Görevler:**
- [ ] `Sale` tablosunu oluştur:
  - id, business_id, document_no, customer_id (nullable), sale_date
  - subtotal, discount_total, tax_total, total_amount
  - status (DRAFT / FINAL / CANCELLED), cancel_reason
- [ ] `SaleItem` tablosunu oluştur:
  - id, business_id, sale_id, product_id, serial_unit_id (nullable), machine_id (nullable)
  - description_snapshot, quantity, unit, unit_price_snapshot, unit_cost_snapshot
  - discount_amount, tax_mode, tax_rate, line_total, stock_movement_id
- [ ] Hızlı satış akışı (§5.3):
  1. Ürün ve miktar seçimi
  2. İndirim (isteğe bağlı)
  3. Ödeme yöntemi ve alınan tutar
  4. Tahsil edilmemiş tutar varsa → müşteri seçimi zorunlu (AC-041)
  5. Hızlı satış tek adımda FINAL olur
- [ ] Müşteri seçilmeden veresiye satış engellemesi (AC-041, TC-042)
- [ ] Satış kesinleştiğinde stok düşümü (ST-006)
- [ ] Belge numarası: `SAT-[cihaz_kodu]-[yıl]-[sıra]`

**İlgili FR:** FR-014  
**İlgili AC:** AC-041

---

### ADIM 4.2 — Detaylı Satış

**Görevler:**
- [ ] Taslak (DRAFT) olarak kaydedilebilir; stok/finans etkisi yoktur (ST-006)
- [ ] Ayrıntılı satış: her ürün/miktar/indirim/vergi satırı
- [ ] Ondalıklı birimli ürün satışı desteklenir (TC-013)
- [ ] Satış FINAL olunca stok düşümü ve ödeme kaydı oluşur
- [ ] KDV: INCLUSIVE / EXCLUSIVE / NONE; belge ve satır bazında
- [ ] İndirim: satır bazlı + belge genelinde; negatif olamaz
- [ ] Belge genelindeki indirim hangi satırlara dağıtıldığı kayıt altında

**İlgili PRD:** §9.2

---

### ADIM 4.3 — Makine Satışı (Seri Takipli)

**Görevler:**
- [ ] Seri takipli makine satışında stoktaki belirli bir ProductSerialUnit seçilir
- [ ] Satış kesinleştiğinde:
  - Seçilen birim → SOLD durumuna geçer
  - İlgili Machine kaydı müşteriyle ilişkilendirilir
- [ ] Makine kaydı satıştan önce mevcutsa aynı kayıt kullanılır; çift kayıt oluşturulmaz (§5.3)
- [ ] Seri numarası olmayan makinelerde birim kaydı yine oluşur; sistem iç numara üretir
- [ ] Aynı birim iki kez satılamaz; çevrimdışı çift satış eşitlemede çakışma kuyruğuna düşer (AC-039, TC-040)

**İlgili FR:** FR-014, FR-029  
**İlgili AC:** AC-027, AC-039  
**Test:** TC-028, TC-040

**Kabul kriteri:**
- Makine satışı stoktaki doğru seri numaralı birimi düşer ve Machine kaydını müşteriyle ilişkilendirir (AC-027).

---

### ADIM 4.4 — Satış İptali

**Görevler:**
- [ ] Kesinleşmiş satış: gerekçe + onay ile iptal edilebilir (§9.6)
- [ ] İptal işlemi:
  - Ürün AVAILABLE stoğa döner
  - Seri birim → IN_STOCK olur
  - Ödemeler ters kaydı veya müşteriye para iadesi
  - Makine satışıysa makine-müşteri ilişkisi geri alınır (sahiplik geçmişine yazılır)
- [ ] İptal ≠ iade (fiziksel ürünün geri gelmesi değil, hatalı kayıt düzeltmesi)
- [ ] Raporlarda ayrı görünür; net toplamdan düşer; belge silinmez (AC-044)

**İlgili FR:** FR-037  
**İlgili AC:** AC-044  
**Test:** TC-045

---

### ADIM 4.5 — Tedarikçi Yönetimi

**Görevler:**
- [ ] `Supplier` tablosu: id, business_id, name, phone, address, notes, archived_at
- [ ] Tedarikçi profili: satın alma geçmişi, yapılan ödemeler, iadeler, açılış bakiyesi, kalan borç
- [ ] Tedarikçi bakiyesi hesabı (§9.3)
- [ ] Tedarikçi arşivleme

**İlgili PRD:** §4.6, §9.3

---

### ADIM 4.6 — Satın Alma

**Görevler:**
- [ ] `Purchase` tablosu: id, business_id, document_no, supplier_id, purchase_date, total_amount, status, notes
- [ ] `PurchaseItem` tablosu: product_id, description_snapshot, quantity, unit, unit_price, line_discount, tax_mode, tax_rate, line_total, stock_movement_id
- [ ] **Hızlı satın alma:**
  - Tedarikçi, tarih, toplam, ödenen tutar, kısa açıklama
  - Stok etkisi için ürün + miktar satırları zorunlu
  - Yalnızca toplam tutarlı kayıt stok miktarını değiştirmez; "stok girişi yapılmadı" uyarısı (§9.5)
- [ ] **Ayrıntılı satın alma:**
  - Her ürün/miktar/birim fiyat/indirim satırı
  - Seri takipli ürünlerde seri numaraları girilebilir
- [ ] Kayıt RECEIVED olunca:
  - Stok artar (StockMovement: PURCHASE_IN)
  - Son alış fiyatı güncellenir (Product.last_purchase_price)
  - Seri takipli ürünlerde ProductSerialUnit kayıtları oluşur
- [ ] DRAFT belge stok hareketi üretmez (ST-006)
- [ ] Belge numarası: `AL-[cihaz_kodu]-[yıl]-[sıra]`
- [ ] KDV bilgisi yalnızca bilgi amaçlı; indirilecek KDV hesabı yapılmaz

**İlgili FR:** FR-015  
**İlgili AC:** AC-007

---

### ADIM 4.7 — Tedarikçi Borç Takibi

**Görevler:**
- [ ] Tedarikçi bakiyesi = açılış bakiyesi + RECEIVED satın alma tutarları - tedarikçiye ödemeler - tedarikçi iadeleri + tedarikçiden alınan iadeler
- [ ] Tedarikçiye ödeme: Payment (direction=OUT, supplier_id dolu)
- [ ] Borç azaltma ödeme hareketiyle olur
- [ ] Tedarikçi borcu raporlanır (§15)

---

### ADIM 4.8 — Satış Ekranı (UI)

**Görevler:**
- [ ] Satışlar sekmesi: hızlı satışlar, makine satışları, taslaklar, tahsilatlar, satış geçmişi
- [ ] Taslak listesi ve taslak düzenleme
- [ ] Satış detayı görüntüleme
- [ ] Satış iptal akışı ekranı
- [ ] Ödeme ekleme ekranı: birden fazla ödeme yöntemi, kısmi tahsilat

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
