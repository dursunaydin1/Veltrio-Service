# FAZ 2 — Stok & Ödeme Çekirdeği

> PRD §20 Faz 2 | Önkoşul: FAZ 1 tamamlanmış olmalı

---

## Amaç

Servis ve satış modülleri bu fazda kurulan ürün kataloğu, stok hareketi ve ödeme altyapısını kullanacak. Bu yüzden FAZ 3 ve FAZ 4'ten önce tamamlanması zorunludur.

---

## Adım Adım İşlem Basamakları

### ADIM 2.1 — Ürün Kataloğu

**Görevler:**
- [ ] `Product` tablosunu migration ile oluştur:
  - ad, kategori, marka, model, kod, birim, stock_qty (satılabilir), damaged_qty (hasarlı), critical_stock_level
  - sale_price, last_purchase_price, default_tax_mode, default_tax_rate
  - compatible_models_note, photo_ref, storage_location, tracks_serial, active
  - created_at, updated_at, version, sync_state, business_id
- [ ] Ürün oluşturma, düzenleme, pasifleştirme
- [ ] Ürün arama ve listeleme
- [ ] Başlangıç kategorileri hazır gelmeli (PRD §8.1): Makineler, Yağlar, Misina, Buji, Hava Filtresi, Yakıt Filtresi, Karbüratör, Marş Grubu, Debriyaj, Bıçak, Zincir, Pala, Aksesuar, Diğer
- [ ] Ürün fotoğrafı isteğe bağlı; boyut küçültme uygulanır (FR-028)
- [ ] Raf/konum alanı isteğe bağlı metin
- [ ] Kritik stok seviyesi ürün bazında ayarlanabilir

**İlgili FR:** FR-011, FR-012  
**İlgili AC:** AC-008

**Kabul kriteri:**
- Ürün listesi görünür; ürün oluşturulur, düzenlenir, pasifleştirilir.

---

### ADIM 2.2 — Seri Takipli Ürün (ProductSerialUnit)

**Görevler:**
- [ ] `ProductSerialUnit` tablosunu oluştur:
  - id, business_id, product_id, serial_number (nullable), internal_number (SB-...), status (IN_STOCK / SOLD / DAMAGED / RETURNED_TO_SUPPLIER)
  - purchase_item_id, sale_item_id, machine_id
- [ ] `tracks_serial = true` olan ürünlerde satın alma sırasında birim kayıtları oluşturulur
- [ ] Seri numarası satın alma sırasında veya sonradan girilebilir; girilmezse sistem `SB-[cihaz_kodu]-[sıra]` üretir
- [ ] Stok miktarı = IN_STOCK birim sayısı (ST-012)
- [ ] Satışta belirli bir birim seçilir; aynı birim iki kez satılamaz

**İlgili PRD:** §7 (ProductSerialUnit), ST-012  
**İlgili FR:** FR-031

---

### ADIM 2.3 — Stok Hareketi (StockMovement)

**Görevler:**
- [ ] `StockMovement` tablosunu oluştur:
  - id, business_id, product_id, serial_unit_id, bucket (AVAILABLE / DAMAGED)
  - movement_type, quantity_delta, quantity_before, quantity_after, unit
  - unit_cost_snapshot, source_type, source_id, reason, occurred_at, device_id, reversal_of_id
- [ ] `movement_type` değerleri: PURCHASE_IN, SALE_OUT, SERVICE_USE, RETURN_IN, ADJUSTMENT, CANCEL_REVERSAL, DAMAGED_TRANSFER, DAMAGED_DISPOSE, OPENING
- [ ] Stok bakiyesi hareketlerden yeniden hesaplanabilir olmalı (ST-013)
- [ ] Fark bulunursa hareketler esas alınır; audit log'a yazılır
- [ ] **Zamanlar:**
  - Satış stoğu → satış FINAL olduğunda
  - Servis stoğu → ServicePart.used_quantity > 0 olduğunda
  - Satın alma stoğu → Purchase RECEIVED olduğunda
  - DRAFT belge stok/finans hareketi üretmez (ST-006)

**İlgili PRD:** ST-005, ST-006  
**İlgili FR:** FR-012, FR-036  
**İlgili AC:** AC-007, AC-050

**Kabul kriteri:**
- Stok bakiyesi hareket defterinden yeniden hesaplanıyor; fark audit log'a yazılıyor (TC-054).

---

### ADIM 2.4 — Negatif Stok ve Kritik Stok Kuralları

**Görevler:**
- [ ] Negatif stok varsayılan olarak engellendi (ST-002)
- [ ] Kullanılabilir stok = eşitlenmiş + yerel bekleyen hareketler dahil satılabilir miktar
- [ ] Negatif stok denemesinde: uyarı + işlem engeli
- [ ] İşletme ayarıyla negatif stoka izin verilirse: kullanıcı onayı + neden kaydı + kritik uyarı (ST-004)
- [ ] **Kritik stok:** AVAILABLE miktar critical_stock_level'e eşit veya altına indiğinde bildirim oluştur (ST-009)
  - Çözülmeden tekrar bildirim oluşmaz
  - Stok tekrar düşerse yeni bildirim
  - Hasarlı stok kritik stok hesabına dahil edilmez

**İlgili PRD:** ST-002, ST-004, ST-009  
**İlgili FR:** FR-013  
**İlgili AC:** AC-008, AC-028, AC-043

**Kabul kriteri:**
- Sıfır stokta satış engellenir (TC-011); kritik stok bildirimi eşik altında oluşur (TC-029).

---

### ADIM 2.5 — Hasarlı Stok

**Görevler:**
- [ ] `bucket` alanı: `AVAILABLE` veya `DAMAGED`
- [ ] `Product.damaged_qty` ayrı takip
- [ ] Hasarlı stoktan çıkış türleri (ST-011):
  - Satılabilire aktarma (onarıldı) → DAMAGED çıkış + AVAILABLE giriş (çift hareket)
  - Tedarikçiye iade → DAMAGED çıkış
  - İmha/hurda → DAMAGED çıkış
- [ ] Neden alanı zorunlu
- [ ] Hasarlı stok kritik stok hesabına dahil edilmez (ST-009)

**İlgili PRD:** ST-007, ST-011  
**İlgili AC:** AC-043, AC-044

---

### ADIM 2.6 — Stok Düzeltme

**Görevler:**
- [ ] Stok düzeltme ekranı:
  - Önceki miktar (mevcut stok)
  - Yeni miktar (kullanıcı girer)
  - Fark (otomatik hesaplanır)
  - Neden (zorunlu)
  - Tarih
  - Onay adımı (kritik işlem)
- [ ] Düzeltme yeni StockMovement kaydı olarak eklenir; geçmiş hareketler silinmez (ST-008)
- [ ] Audit log'a yazılır

**İlgili PRD:** ST-008  
**İlgili AC:** AC-031  
**Test:** TC-033

**Kabul kriteri:**
- Stok 10'dan 7'ye düzeltildiğinde -3 fark, neden ve onay geçmişte görünür.

---

### ADIM 2.7 — Temel Ödeme Sistemi

**Görevler:**
- [ ] `Payment` tablosunu oluştur:
  - id, business_id, customer_id, supplier_id, direction (IN / OUT)
  - method (CASH / CARD / BANK_TRANSFER / OTHER)
  - amount, occurred_at, reference, status (POSTED / REVERSED)
  - reversal_of_id, sale_id, purchase_id, service_order_id
- [ ] `PaymentAllocation` tablosunu oluştur:
  - id, business_id, payment_id, target_type (SALE / SERVICE / PURCHASE / OPENING_BALANCE), target_id, amount
- [ ] Hatalı ödeme silinmez; ters Payment (REVERSED, reversal_of_id) ile düzeltilir (§9.4)
- [ ] CREDIT/VERESIYE geçerli tahsilat yöntemi değildir (§9.4)
- [ ] Belgeden alınan ödeme otomatik o belgeye tahsis edilir

**İlgili PRD:** §9.4  
**İlgili FR:** FR-017

---

### ADIM 2.8 — Bakiye Hesaplama

**Görevler:**
- [ ] Müşteri bakiyesi hesaplama formülünü kodla (§9.3):
  ```
  müşteri_bakiyesi = açılış_bakiyesi
                   + kesinleşmiş_satış_ve_ücretli_servis_tutarları
                   - müşteriden_alınan_ödemeler (IN)
                   - iade_tutarları
                   + müşteriye_yapılan_ödemeler (OUT)
  ```
- [ ] Tedarikçi bakiyesi hesaplama formülünü kodla (§9.3)
- [ ] Bakiye her zaman belgelerden hesaplanır; önbellekten değil
- [ ] Belge bazlı açık tutara kırılım (hangi belge ne kadar açık)
- [ ] Pozitif bakiye = müşteri borçlu; negatif bakiye = işletme borçlu

**İlgili AC:** AC-010, AC-011, AC-046

**Kabul kriteri:**
- Kısmi ödeme sonrası belge toplamı, tahsil edilen ve kalan bakiye ayrı ve doğru (TC-011 mantığı).

---

### ADIM 2.9 — Ürün ve Stok Ekranları (UI)

**Görevler:**
- [ ] Ürün listesi (ad, kategori, stok, kritik seviye durumu)
- [ ] Ürün detay sekmeler: Hareketler, Alışlar, Satışlar, Hasarlı stok, Seri birimler
- [ ] Stok hareketi geçmişi görüntüleme
- [ ] Stok düzeltme ekranı (Adım 2.6)
- [ ] Kritik stok uyarısı badge/göstergesi
- [ ] Ana ekran "Kritik stok" metriği

---

### ADIM 2.10 — Çevrimdışı Stok Uyarısı

**Görevler:**
- [ ] Çevrimdışıyken stok = cihazın bildiği son stok + bekleyen yerel hareketler
- [ ] İki cihaz çevrimdışı aynı son stoğu tüketirse:
  - Eşitlemede hareketler silinmez
  - Çakışma kuyruğu açılır (ST-003)
  - Kullanıcıya stok düzeltme/işlem iptali gibi telafi seçenekleri sunulur
- [ ] Bu risk ve çözüm yolu arayüzde açıkça görünür (AC-009)

**İlgili AC:** AC-009  
**Test:** TC-012

---

## FAZ 2 Tamamlanma Kriterleri

| # | Kriter | AC/TC Referansı |
|---|--------|----------------|
| 1 | Ürün oluşturulur, düzenlenir, pasifleştirilir | FR-011 |
| 2 | Seri takipli ürünlerde her fiziksel birim ayrı kayıtlı | AC-039 |
| 3 | Stok miktarı hareket defterinden yeniden hesaplanıyor | TC-054 |
| 4 | Sıfır stokta satış varsayılan olarak engelleniyor | AC-008, TC-011 |
| 5 | Kritik stok bildirimi eşik altında oluşuyor, çözülmeden tekrarlanmıyor | AC-028, TC-029 |
| 6 | Hasarlı iade DAMAGED stoğa gidiyor; satılabilir stoğu etkilemiyor | AC-043, TC-044 |
| 7 | Stok düzeltmede neden, fark ve onay geçmişte görünüyor | AC-031, TC-033 |
| 8 | Müşteri bakiyesi doğru hesaplanıyor | AC-010, AC-011 |
| 9 | İki cihaz çevrimdışı aynı stoğu tükettiğinde çakışma oluşuyor | AC-009, TC-012 |
| 10 | Maliyet snapshot'ı stok çıkışı yapan işlemlere kaydediliyor | AC-050 |

---

## Sonraki Faz

[FAZ 3 — Servis Modülü →](./03_FAZ3_SERVIS.md)
