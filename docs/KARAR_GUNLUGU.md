# Karar Günlüğü

> Plandan (docs/00–07) veya PRD'den sapmaların, düzeltmelerin ve yeni çözümlerin kaydı. Yeni kayıtlar en üste eklenir.
> Biçim: **Ne değişti → Neden → Sonuç / etkilenen dosyalar**

## 2026-10-22

### K-032 · Tedarikçiye iade
- **Karar:** Satış iadesiyle aynı tablolar (`return_transactions`, `original_type = PURCHASE`) ve aynı para kuralı kullanılır: iade tutarı tedarikçi borcunu düşürür; ödeme yöntemi seçilirse yalnızca alıma fazla ödenen kısım tedarikçiden geri alınmış (IN) sayılır; “borçtan düş” seçilirse ödeme yazılmaz. Stok RETURN_OUT ile seçilen kovadan çıkar, yeterli stok yoksa işlem reddedilir. Seri takipli üründe birimler tek tek seçilir ve `RETURNED_TO_SUPPLIER` olur (stokta olmayan birim iade edilemez); bu iade geri alınamaz.
- **Etki:** `returns/purchase.ts`, `finance/service.ts` (tedarikçi bakiyesi), `purchases/service.ts` (`getPurchaseBalance.returned`), `PurchaseReturnPanel`.

### K-031 · Müşteri ürün iadesi: para ve bakiye kuralı
- **Karar:** İade, orijinal satış satırına bağlı `return_transactions`/`return_items` kaydıdır; stok durumu SELLABLE / DAMAGED / NOT_RETURNED. Para tarafı çift saymayı önlemek için şöyle işler: iade tutarı satış bakiyesini (ve müşteri bakiyesini) düşürür; nakit/kart/havale seçilirse yalnızca **satışa fazladan ödenmiş kısım** kadar `OUT` ödemesi yazılır (veresiye satışta nakit çıkmaz, borç düşer); `CUSTOMER_CREDIT` seçilirse ödeme yazılmaz, fazla ödeme müşteri alacağı olarak kalır.
- İade ödemesi satış belgesine (`source_type SALE`) bağlanır; böylece satışın kalan tutarı doğru çıkar. İadesi olan satış iptal edilemez (önce iade geri alınır). İade geri alma: ters stok hareketi + ters ödeme, kayıt REVERSED kalır. Seri numaralı ürünün iadesi geri alınamaz.
- **Etki:** migration 019, Dexie v5 (`original_line_id` indeksi), `returns/service.ts`, `finance/service.ts` (müşteri bakiyesi), `sales/service.ts` (`getSaleBalance.returned`), `SaleReturnPanel`.

### K-030 · Kesinleşmiş satış iptali
- **Karar:** İptal, belgeyi silmeden ters kayıtlarla yapılır: stok için `CANCEL_REVERSAL` hareketi (`reversal_of_id` ile asıl harekete bağlı), tahsilat için karşı yönlü ters ödeme, seri birim `IN_STOCK`, makine satışında satış bilgisi makineden kalkar ve sahiplik geri alınır. Tek kullanıcılı uygulamada ayrı yönetici onayı yerine zorunlu neden + açık onay ekranı kullanılır.
- **Etki:** `sales/service.ts` (`cancelFinalSale`), `machines/service.ts` (`detachSaleFromMachine`), `stock/service.ts` (`reversalOfId`), `SaleDetail`.
- **Test düzeneği:** sunucu testinde her gönderimden sonra çekme yapılır (uygulama da yapar); aksi halde art arda güncelleme sahte sürüm çakışması verirdi.

### K-029 · Sunucuya karşı otomatik QA testi ve kuyruk birleştirme hatası
- **Karar:** `npm run test:e2e` ile gerçek Supabase'e karşı uçtan uca test düzeneği kuruldu (`docs/08_QA_TEST.md`). Tarayıcıda elle deneme yerine her adım sonrası çalıştırılır.
- **Bulunan hata:** `enqueue` bekleyen INSERT'e UPDATE birleştirirken INSERT yükünü eziyordu; UPDATE yükünde belge no/oluşturma sütunları olmadığından sunucu NOT NULL ile reddediyordu. Artık UPDATE değişiklikleri INSERT yükünün üzerine bindirilir (regresyon testi `queue.test.ts`).
- **Etki:** `src/lib/sync/queue.ts`, `e2e/`, `vitest.e2e.config.mts`.

### K-028 · Seri takipli ürünler: birim kaydı, makine satışı ve kuyruk döngüsünün kırılması
- **Model:** Seri takipli ürünün her fiziksel birimi `product_serial_units` kaydıdır (seri no + iç numara `SB-…`). Stok yine hareket defterinden hesaplanır; her birim için ±1'lik, `serial_unit_id`'li hareket yazılır (ST-012). Bu hareketler dışında seri takipli ürüne elle stok hareketi yapılamaz.
- **Alım:** Satırda seri numaraları girilir (taslakta `purchase_items.serial_numbers`); teslim alınınca her adet ayrı birim ve +1 hareket olur, birim maliyeti satır tutarından. Aynı üründe tekrar eden seri numarası (harf/Türkçe karakter farkı olsa da) reddedilir ve işlem geri alınır.
- **Satış:** Makine satışında müşteri ve stoktaki bir birim zorunludur; aynı birim iki kez satılamaz (kesinleştirmede tekrar kontrol edilir, taslak birimi ayırmaz). Kesinleşince birim `SOLD` olur ve makine kaydı bağlanır: müşteriye ait aynı marka+seri no'lu kayıt varsa o kullanılır; başka müşteriye aitse sahiplik geçmişe yazılarak devredilir; yoksa yeni kayıt açılır (satış belgesi, tarihi ve fiyatı makinede saklanır).
- **Eşitleme sırası:** `purchase_item_id`, `sale_item_id` (birimde) ve `machines.sale_id` yabancı anahtar değildir: birim → alım satırı → stok hareketi → birim döngüsü ve "makine satıştan önce gider" kuralı yabancı anahtarlarla çelişirdi. Bağlantı bilgi amaçlıdır.
- **İşlem kapsamı:** `recordMovement` seri birim tablosunu yalnızca birimli harekette işleme katar; yoksa birimsiz çağrılar (satış, servis parçası) bu tabloyu içermeyen dış işlemlerde hata verirdi.
- **Etki:** migration 018, `src/lib/serial/*`, `purchases/service.ts`, `sales/service.ts`, `machines/service.ts`, `SerialUnitsPanel`, `SerialUnitSelect`.

### K-027 · Satış: tek hesap fonksiyonu, belge indirimi satıra yazılır, kesinleştirme tek işlem
- **Tutarlar:** Hesap `computeSaleTotals` (saf) içinde yapılır; hem servis hem ekranın canlı toplamı bunu kullanır, bu yüzden görünen toplam ile kaydedilen toplam aynıdır. Satır indirimi + belge indirimi payı → KDV → satır toplamı → belge toplamı (yuvarlanmış satır toplamlarının toplamı).
- **Belge indirimi:** Satırların indirim sonrası tutarına orantılı, en büyük kalan yöntemiyle (toplam kuruşu tam korur) dağıtılır ve her satırın `discount_amount`'ına eklenir; ayrı bir "belge indirimi" sütunu yok, dağıtım satırlarda kayıt altındadır (plan: "hangi satırlara dağıtıldığı kayıt altında").
- **Kesinleştirme tek işlemde:** stok düşümü (`SALE_OUT`, maliyet snapshot'ı kesinleştirme anındaki son alış fiyatından), kalem–hareket bağı, satış durumu ve tahsilat birlikte yazılır; biri başarısızsa (stok yetersiz, müşterisiz veresiye, fazla tahsilat) hiçbiri yazılmaz.
- **Kurallar:** Müşterisiz satışta tahsil edilmeyen tutar yok (AC-041); fazla tahsilat kabul edilmez; eksi stok yalnızca ayar açıksa ve nedenle; seri takipli ürün bu ekranda satılamaz (makine satışı ayrı akış).
- **Müşterisiz ödeme:** `recordDocumentPayment` müşteri olmadan da ödemeyi belgeye bağlar.
- **Test notu:** Türkçe `İ` harfi `/i` bayraklı düzenli ifadeyle eşleşmez; hata mesajı testlerinde bu yüzden sabit kelime parçaları kullanıldı.
- **Etki:** migration 017, `src/lib/sales/*`, `src/components/sales/*`, `CustomerPicker` (isteğe bağlı mod), `calc.ts` (`lineGross`, `distributeAmount`).

### K-026 · Satın alma: maliyet KDV dahil, teslim alma tek işlem, düzeltme iade ile
- **Maliyet:** KDV bilgi amaçlıdır ve indirilmez (§9.5), bu yüzden birim maliyet = **KDV dahil satır toplamı / miktar** (4 ondalık). Stok hareketi `unit_cost`'una ve ürünün son alış fiyatına bu yazılır.
- **Tek işlem:** Teslim alma (stok hareketleri, kalem–hareket bağı, son alış fiyatı, alım durumu, isteğe bağlı ödeme) birlikte yazılır; biri başarısız olursa hiçbiri yazılmaz. Taslak (DRAFT) stok ve finans etkisi üretmez (ST-006).
- **Hızlı alım:** Ürün satırı yoksa yalnızca toplam tutar kaydedilir; stok değişmez ("stok girişi yapılmadı" uyarısı) ama tedarikçi borcuna yazılır.
- **Düzeltme:** Teslim alınmış alım değiştirilemez; hata tedarikçiye iade ile düzeltilir (Faz 5). Yalnızca taslak düzenlenir (satırlar silinip yeniden eklenir) ve iptal edilir.
- **Sınır:** Seri takipli ürün alımı makine satışı adımıyla (birim kayıtları) gelecek; şimdilik reddedilir.
- **Etki:** migration 016, `src/lib/purchases/*`, `src/components/purchases/*`, `setLastPurchasePrice`.

### K-025 · Müşteri ve tedarikçi için ortak "taraf" altyapısı
- **Sorun:** Ödeme, ters kayıt, açılış bakiyesi ve bakiye paneli yalnızca müşteri için yazılmıştı; tedarikçi için aynısını kopyalamak tutarsızlık riski taşırdı.
- **Karar:** `recordPartyPayment` / `setPartyOpeningBalance` taraf türü (`CUSTOMER` | `SUPPLIER`) alır; müşteri ve tedarikçi sürümleri ince sarmalayıcıdır. Ters kayıt zaten tarafı orijinalden kopyaladığı için ortak çalışır. `BalancePanel` yerine `PartyBalancePanel`: etiketler tarafa göre değişir (müşteri: Tahsilat al / Müşteriye ödeme; tedarikçi: Ödeme yap / Tedarikçiden iade ödemesi).
- **Tedarikçi bakiyesi** işletme açısından işaretlidir (pozitif = tedarikçiye borçluyuz): açılış + teslim alınmış alımlar − ödemeler (OUT) − iadeler + tedarikçiden alınan iade ödemeleri (IN).
- **Test notu:** Ortak ödeme fonksiyonunun işlemi yalnızca ilgili tarafın tablosunu kapsar; tüm tabloları saymak, yalnızca müşteri tablolarını içeren dış işlemlerde (servis kabulü, teslim) "tablo işlemde değil" hatası veriyordu.
- **Etki:** `src/lib/finance/*`, `src/lib/suppliers/*`, `PartyBalancePanel.tsx`; migration gerekmedi.

### K-024 · Fiş / PDF: yazdırılabilir sayfa, `jsPDF` değil
- **Plan:** Tarayıcı taraflı PDF (jsPDF veya react-pdf).
- **Sorun:** jsPDF'in varsayılan yazı tipleri Türkçe karakterleri (ş, ğ, ı, İ) basamaz; her çıktıya ayrı yazı tipi gömmek gerekir. Dar fiş ve A4 için ayrı yerleşim kodu da ister.
- **Karar:** Fiş, tarayıcıda yazdırılabilir bir sayfadır (CSS ile A4 ve 72 mm dar fiş). "Yazdır / PDF kaydet" tarayıcının yazdır penceresini açar: yazıcıya basar ya da "PDF olarak kaydet" ile dosya üretir. Türkçe karakterler ve her cihazın yazıcı sürücüsü tarayıcı tarafından yönetilir. Gerekirse sonradan WhatsApp'a gönderilecek PDF için ayrı bir üretici eklenebilir.
- **Gizlilik:** Müşteri çıktısı, maliyet alanı hiç bulunmayan saf bir modelden üretilir (AC-034); testle doğrulanır. Belge "resmî fatura yerine geçmez" notu taşır.
- **Etki:** `src/lib/services/receipt.ts`, `ReceiptView.tsx`, `globals.css` yazdırma stilleri.

### K-023 · Tamamlamada parça kullanım kuralı; teslimde kalan bakiye ve borç kabulü
- **Bulgu:** Gerçek denemede bir servis, stoktan faturalanan parça "kullanıldı" işaretlenmeden teslim edildi: müşteriye parça bedeli yazıldı ama stok düşmedi.
- **Karar:** Stoktan faturalanan (karar bekleyen veya onaylı) parça tam miktarda kullanıldı işaretlenmeden "İş tamamlandı"ya geçilemez; müşterinin getirdiği, stok dışı ve reddedilen parçalar muaftır.
- **Teslim:** `deliverService` tek işlemde: (isteğe bağlı) teslim tahsilatı → kalan bakiye = servis tutarı − servise bağlı net ödemeler → kalan > 0 ise müşterinin borcu kabulü zorunlu (aksi halde tahsilat da geri alınır) → durum DELIVERED, teslim alan kişi, kalan tutar ve kabul servise yazılır. Fazla ödeme borç sayılmaz (müşteri alacağı). Yeniden açılınca teslim bilgileri temizlenir, ödemeler kalır.
- **Servis bakiyesi** servise bağlı ödemelerden hesaplanır (`source_type = SERVICE`, `source_id`); ters kaydedilen ödeme karşı yönlü kopya olduğundan otomatik düşer.
- **Etki:** migration 015, `src/lib/services/service.ts`, `ServicePayments.tsx`.

### K-022 · Servis teklifi: satır bazlı karar, parça kullanımı stokla bağlı, sıralı gönderim
- **Teklif modeli:** Servis tutarı (`total_amount`) satırlardan hesaplanır ve her değişiklikte güncellenir: yalnızca karar bekleyen (PENDING) ve onaylı (APPROVED) satırlar sayılır; reddedilen/ertelenen girmez. Onay eşiğini (ayar, varsayılan 1.000 ₺; 0 = her ücretli iş) aşan teklifte karar bekleyen satır varken "İşlemde"ye geçilemez; teklif işlem sırasında artarsa servis otomatik "Müşteri onayı bekleniyor"a alınır. Onaylı satırın tutarı artarsa yeniden onay bekler (tolerans 0).
- **service_parts yeniden anlamlandırıldı:** Eski `status` (PENDING/APPROVED/REJECTED/ARRIVED/USED) hem onayı hem teminat/kullanımı karıştırıyordu. Artık `status` yalnızca müşteri kararı; temin `supply_status`, kullanım `used_quantity`. Mevcut ARRIVED/USED kayıtları APPROVED'a çevrildi.
- **Stok:** Teklifte stok değişmez; "kullanıldı" denince `SERVICE_USE` (maliyet snapshot'lı) hareketi yazılır, azaltma `CANCEL_REVERSAL` ile ve nedenle. Negatif stok kuralı stok çekirdeğinden gelir.
- **Eşitleme sırası (Adım 1.7 maddesi kapandı):** Kuyruk, tablo bağımlılığına göre sıralanır (müşteri → ürün → makine → stok hareketi → servis → satırlar → ödeme → geçmiş → audit). Aksi halde bir servis ile satırı aynı anda gönderilirken satır önce gidip yabancı anahtar hatası alabiliyordu.
- **Etki:** migration 014, `src/lib/services/{lines,quote,service}.ts`, `ServiceLines.tsx`, `ProductPicker.tsx`, `src/lib/sync/{tables,queue}.ts`.

### K-021 · Servis durum kümesi PRD §6.1'e uyduruldu; kabul ve durum değişimi tek işlemde
- **Sorun:** Şemadaki durumlar (`WAITING_DIAGNOSIS`, `READY_FOR_DELIVERY`…) PRD §6.1'deki akıştan farklıydı; "Kabul edildi", "Teşhis tamamlandı", "İş tamamlandı" eksikti.
- **Karar:** `RECEIVED → (WAITING_DIAGNOSIS) → DIAGNOSED → (WAITING_CUSTOMER_APPROVAL) → IN_PROGRESS ⇄ WAITING_PARTS → COMPLETED → DELIVERED / CANCELLED` (eski `READY_FOR_DELIVERY` `COMPLETED` oldu). Geçiş tablosu saf bir modülde (`status.ts`) tutulur. Teslim edilmiş servis iptal edilemez ama yeniden açılabilir; iptal ve yeniden açma neden ister.
- **Tutarlılık:** Servis açma (servis + durum geçmişi + bağlı geçici makine + kapora tahsilatı + belge sayacı) tek işlemde yazılır; biri başarısızsa hiçbiri kaydedilmez. Kapora normal tahsilat olduğundan müşteri bakiyesini düşürür.
- **Kabul formu:** Arıza kataloğu henüz yok; sık arıza başlıkları (PRD §8.1) düğme olarak şikâyet metnine eklenir. Makine bilinmiyorsa geçici makine inline açılır (30 saniye hedefi).
- **Etki:** migration 013, `src/lib/services/*`, `src/components/services/*`, makine ve ana ekran bağlantıları.

### K-020 · Makine: iç numara her makinede, `status` sütunu yok
- **Plan:** İç numara yalnızca seri numarası yoksa; `status` (TEMPORARY / ACTIVE / INACTIVE).
- **Karar:** Her makineye iç numara (`MK-[cihaz]-[sıra]`) atanır: QR ve kısa kimlik için tek biçim, seri numarası yanlış yazılsa da makine tanınır. Durum için ayrı sütun yerine mevcut alanlar kullanılır: geçici = `is_temporary`, pasif = `archived_at`, birleştirilmiş = `merged_into_id`. QR içeriği ayrı sütun değil makine kimliğidir (değişmez).
- **Mükerrer seri:** Marka + seri numarası, harf ve Türkçe karakterden bağımsız karşılaştırılır; arşivli ve birleştirilmiş makineler sayılmaz; kullanıcı onayla devam edebilir (AC-029).
- **Sahiplik:** Makine formunda sahip değiştirilemez; değişiklik yalnızca-ekleme geçmişe (eski/yeni müşteri, neden, aktör, cihaz) ve audit log'a yazılır, neden zorunlu (AC-018).
- **Test notu:** `Table.toArray()` birincil anahtara (rastgele UUID) göre sıralar; "ilk eklenen ilk gelir" varsayan iki test arada düşüyordu, sıradan bağımsız hale getirildi.
- **Etki:** migration 012, `src/lib/machines/*`, `src/components/machines/*`, `CustomerPicker`.

### K-019 · Ödeme ters kaydı ve açılış bakiyesi
- **Plan:** "Ters Payment (REVERSED, reversal_of_id)"; açılış bakiyesi değişikliği kritik işlem.
- **Sorun:** Ödemeler yalnızca-ekleme tablosu (sunucu UPDATE'i reddeder). Orijinali "REVERSED" yapmak güncelleme gerektirirdi.
- **Karar:** Orijinal ödeme olduğu gibi kalır. Ters kayıt, karşı yönlü yeni bir `Payment`'tır (`status = REVERSED`, `reversal_of_id = orijinal`); bakiye formülü ek kural gerektirmeden doğru çıkar. Ekranda orijinal "İptal edildi", ters kayıt "Ters kayıt" etiketi alır. Bir ödeme yalnızca bir kez ters kaydedilir (sunucuda benzersiz indeks); ters kaydın tersi yapılamaz. Bağlı tahsisler aynı tutarla ters çevrilir. Neden zorunlu, audit log'a yazılır.
- **Açılış bakiyesi:** Müşteri başına tek kayıt. İlk giriş neden istemez (audit CREATE), değiştirmek neden ister (audit UPDATE, eski/yeni değer). Sahte satış/ödeme üretilmez.
- **Arşivleme:** Bakiyesi sıfır olmayan müşteri artık arşivlenemez (AC-030 tamamlandı).
- **Etki:** migration 011, `src/lib/finance/*`, `BalancePanel.tsx`.

### K-018 · Müşteri: köy zorunlu, adres isteğe bağlı; Türkçe karakterden bağımsız arama
- **Plan:** "adres/köy" tek zorunlu alan; telefon normalizasyonu mükerrer uyarısı için.
- **Karar:** `village` ("Köy / mahalle") zorunlu, `address` ("Açık adres") isteğe bağlı; telefon, "Telefonu yok" işaretlenmedikçe zorunlu ve en az 10 haneli (sabit hat ve yurt dışı da kabul). Mükerrer telefon uyarısı yazarken görünür; arşivlenmiş müşteriler uyarıya dahil değildir.
- **Arama:** Telefonda Türkçe klavye şart olmasın diye ürün ve müşteri aramaları ı/ğ/ü/ş/ö/ç ve büyük/küçük harften bağımsızdır (`foldText`). Yalnızca rakam yazılırsa telefonda aranır (baştaki 0 yok sayılır). Büyük "I" Türkçe'de "ı" olduğundan ("ALI" → "alı") düz küçük harfe çevirme yetersizdi.
- **Etki:** migration 010, `src/lib/customers/*`, `src/lib/utils/search.ts`, liste bileşenleri.

### K-017 · Stok: bakiye hareket defterinden hesaplanır; `quantity_before/after` yok
- **Plan:** Her harekette önceki/sonraki miktar saklanacak; `Product.stock_available` bakiye olarak kullanılacak (Adım 2.3).
- **Sorun:** İki cihaz çevrimdışı hareket üretirse "önceki/sonraki" değerleri yerelde doğru görünür ama birleşince yanlış olur. Ürün satırındaki bakiye de eşitlemede ezilebilir.
- **Karar:** Bakiye daima hareketlerin toplamıdır (`ledger.ts`, tam sayı birimlerle); ekranda gösterilen budur, böylece eşitlenmemiş yerel hareketler de anında yansır. `products.stock_available/damaged` sunucuda hareket eklenince tetikleyiciyle güncellenen bir özet olarak kalır (raporlar ve ileride tutarlılık denetimi için). Yalnızca stok değişen ürün güncellemesi `version` artırmaz; aksi halde her hareket ürünü düzenleyen cihazda sahte çakışma üretirdi.
- **Kovalar:** `bucket` = `AVAILABLE | DAMAGED`; hasarlı stok kritik stok hesabına girmez ve hiç eksiye düşmez.
- **Etki:** migration 009, `src/lib/stock/*`, `StockPanel.tsx`, `ProductList.tsx`.

### K-015 · Kuyruk birleştirme ve "stok alanı sunucuya yazılmaz" kuralı
- **Sorun 1:** Çevrimdışıyken aynı kaydı iki kez düzenlemek kuyrukta aynı sürümden iki UPDATE oluşturur; birincisi gidince sunucu sürümü artar, ikincisi sahte çakışma olurdu.
- **Karar 1:** `enqueue`, aynı kayda ait bekleyen (PENDING) değişikliği yeni kayıt açmadan birleştirir (INSERT+UPDATE → INSERT; INSERT+DELETE → ikisi de silinir; UPDATE+UPDATE → ilk `version` korunur; UPDATE+DELETE → DELETE).
- **Sorun 2:** Ürün güncellemesine yerel `stock_available` değerini koymak, sunucudaki gerçek stoğu eski değerle ezerdi.
- **Karar 2:** UPDATE yalnızca kullanıcının düzenleyebildiği sütunları gönderir; boş alanlar `null` gider (aksi halde sunucu eski değeri korur). Stok yalnızca stok hareketleriyle değişecek (Adım 2.3).
- **Bilinen sınırlama:** Pull, yerel kaydı sunucudakiyle değiştirir; push ile pull arasında yapılan yeni bir düzenleme geçici olarak eski görünebilir. Eşitleme sağlamlaştırma adımında ele alınacak.
- **Etki:** `src/lib/sync/queue.ts`, `src/lib/products/service.ts`.

### K-016 · Ürün kategorileri ve birimleri sabit liste
- **Karar:** Başlangıç kategorileri (PRD §8.1) ve birimler tablo değil kod sabiti (`src/lib/products/constants.ts`); kullanıcı yeni kategori ihtiyacı duyarsa tablo + yönetim ekranı sonra eklenir. Ürün kodu aynı işletmede büyük/küçük harf ayrımsız benzersizdir (yerelde engellenir, sunucuda `UNIQUE (business_id, code)`).

### K-014 · Cihaz kaydı sunucu fonksiyonuyla (K-002 kapatıldı)
- **Sorun:** Cihaz kodunu tarayıcı rastgele üretip `devices` tablosuna kendisi ekliyordu (FR-002'ye aykırı, kod çakışırsa kayıt başarısız). Sunucuda iptal edilmiş cihaz tarayıcıda hâlâ "kayıtlı" görünüyordu. İptal edilen cihaz kendini yeniden etkinleştirebiliyordu.
- **Karar:** `register_device(p_device_name)` (SECURITY DEFINER) kodu `PREFIX-XXXX` biçiminde üretir, çakışırsa 10 kez yeniden dener. Tarayıcının `devices` tablosuna INSERT yetkisi kaldırıldı; UPDATE yalnızca `device_name, last_synced_at, is_active, revoked_at` sütunlarına izinli. Tetikleyici iptal edilen cihazın yeniden etkinleştirilmesini engeller (AC-045). İstemci tarafı `generateDeviceCode` silindi.
- **İstemci:** Oturum sunucudan yüklenince (`sessionLoaded`) cihaz kayıtlı/aktif değilse uygulama yerine "Bu cihazı kaydet" ekranı çıkar; sunucuda iptal edilmiş cihaz artık yerelde de tanımsız sayılır.
- **Açık:** İptal sonrası yerel verinin silinmesi (`wipe_confirmed_at`) ve cihaz listesi/iptal ekranı.
- **Etki:** `supabase/migrations/007_register_device.sql`, `useDevice.ts`, `useAuth.ts`, `DeviceSetup.tsx`, `AppShell.tsx`, `session.ts`.

### K-013 · "Bugünün durumu" yalnızca işletme bilgisi gösterir
- **Sorun:** Ana ekrandaki "Eşitlenmeyi bekleyen" ve "Eşitleme sorunu" kutuları üst çubuktaki göstergeyle aynı bilgiydi ve işletme sahibi için teknik.
- **Karar:** İki kutu kaldırıldı. Ana ekrana iş metrikleri (aktif servis, kritik stok, bugünkü satış, teslim tarihi yaklaşanlar) ilgili özellik yazıldıkça eklenir; eşitleme ayrıntıları Faz 6'daki eşitleme/bildirim merkezinde olacak.

### K-012 · Nötr koyu gri tema; eşitleme göstergesi sakin
- **Geri bildirim:** Lacivert/mavi koyu tema amatör görünüyor; "Eşitlendi 12:40" yazısı her zaman görünmesin.
- **Tema:** Arka planlar nötr koyu griye çekildi (`#141414` zemin, `#1c1c1e` yüzey, `#242426` yükseltilmiş); metin ve kenarlık renkleri nötrleştirildi. Giriş ekranındaki mavi parlama, logo gradyanı ve gradyanlı başlık kaldırıldı. Vurgu rengi **turuncu** (`--accent-primary: #f97316`, hover `#ea580c`, açık `#fb923c`); düğme ve seçili sekme bununla boyanır. Turuncu zeminde beyaz yazı okunmadığı için birincil düğme, seçili metin ve atlama bağlantısı koyu yazı (`--text-inverse`) kullanır (kontrast ≥ 6:1). Renk tek yerde (`globals.css` tokenları) tanımlı; `badge-blue` sınıfı `badge-accent` oldu.
- **Gösterge:** Plan "her zaman görünür: bekleyen sayı, son eşitleme" diyordu. Her şey yolundayken yalnızca küçük simge görünür (ekran okuyucu metni ve ipucu duruyor); bekleyen, sorun ve çevrimdışı durumda metin çıkar. Son eşitleme zamanı Menü sayfasında.
- **Etki:** `globals.css`, `SyncStatus.tsx`, `LastSyncInfo.tsx`, giriş sayfası, `manifest.json`.

### K-011 · Henüz yapılmamış bölümler 404 yerine "yakında" sayfası gösterir
- **Sorun:** Alt menü ve hızlı eylemler olmayan sayfalara gidiyordu (404).
- **Karar:** Her bölüm için ilgili fazı belirten `ComingSoon` sayfası kondu; sayfa gerçekleştiğinde dosya ezilecek. İkincil menüye plandaki öğelere ek olarak "Satın Almalar" eklendi (satın alma için ayrı giriş gerekiyor). Ara ve QR Tara hızlı eylemleri hazır olana kadar devre dışı.
- **Etki:** `src/app/(app)/*/page.tsx`, `src/components/layout/*`.

### K-010 · Push: ekleme idempotent, güncelleme sürüm kontrollü
- **Sorun:** Push API her işlemi `upsert` ile uyguluyordu. İki cihaz aynı kaydı değiştirirse sondaki ötekini sessizce eziyordu; ayrıca ağ hatasıyla yeniden denenen eski bir "ekleme", arada güncellenmiş kaydı eski hâline döndürebiliyordu.
- **Karar:** INSERT yalnızca ekler (kayıt zaten varsa başarı sayılır, ezmez). UPDATE yalnızca `payload.version` sunucudakiyle eşitse uygulanır; değilse `CONFLICT` döner ve kayıt kuyrukta bekler. DELETE koşulsuz kalır (silme yerine `archived_at` tercih edilir).
- **Not:** Pull sırasında yerel kayıt sunucudakiyle değiştirilir; çakışan yerel düzenleme kuyruktaki `payload`'da saklı kalır, çözüm ekranı sonra yazılacak.
- **Etki:** `src/lib/sync/apply.ts` (yeni), `push/route.ts`, `client.ts`, `queue.ts` (`markConflict` mesaj alır).

### K-009 · `sync_state` yalnızca istemcide, `version` hem istemcide hem sunucuda
- **Plan:** Her kayıtta `version` ve `sync_state` alanı (Adım 1.2, 1.7).
- **Sorun:** `sync_state` (`PENDING_SYNC | SYNCED | CONFLICT | ERROR`) sunucuda anlamsız: sunucudaki her kayıt zaten eşitlenmiştir. Sütun eklemek yer kaplar, kimse okumaz.
- **Karar:** `version` sunucuda tutulur (UPDATE'te tetikleyici +1 artırır, çakışma tespitinde kullanılır). Eşitleme durumu zaten `sync_queue` tablosunda (`PENDING/SYNCED/ERROR/CONFLICT`) izlenir; kayıt başına ayrı `sync_state` yerel kayıtta isteğe bağlı kalır.
- **Etki:** `supabase/migrations/006_versioning_and_audit_sync.sql`.

### K-008 · Şema değişiklikleri "tam zamanında" yapılır
- **Plan:** Faz 2–7 tablolarının tamamı baştan, tam alan listesiyle kurulacak gibi yazılmış.
- **Sorun:** Alanlar (ör. `bucket`, `quantity_before/after`, ürün fotoğrafı) o özellik yazılırken netleşiyor; baştan eklemek tahmine dayalı ve sonradan değiştirilmesi gerekebilir.
- **Karar:** Kesen konular (versiyon, audit eşitleme, ayarlar) hemen yapılır. Özelliğe özgü alanlar, o özellikten hemen önce kendi migration'ında eklenir (007, 008…).

### K-007 · `audit_logs` artık sunucuya eşitleniyor
- **Sorun:** `audit_logs` `SYNC_TABLES` listesinde yoktu; denetim kayıtları yalnızca cihazda kalıyordu (AC-032 sağlanmıyordu).
- **Karar:** Tablo eşitlenen tablolara ve yalnızca-ekleme (append-only) listesine eklenir; `actor_id` ve `reason` alanları eklenir.
- **Etki:** migration 006, `src/lib/sync/tables.ts`.

### K-006 · İşletme ayarlarının varsayılanları plana uyduruldu
- **Plan:** `approval_threshold` 1.000 ₺, `allow_negative_stock` false, `delivery_reminder_days` 1, `max_offline_days` 30 (Adım 1.4).
- **Durum:** Şemada onay eşiği 0 idi, `allow_negative_stock` ve `max_offline_days` yoktu. Ayrı `BusinessSettings` tablosu yerine mevcut `businesses.settings` (JSONB) kullanılmaya devam ediliyor (tek kullanıcılı sistem için yeterli, eşitleme basit).

### K-005 · Belge numarası: cihaz kodu içeren kalıcı sayaç
- **Karar:** `S-/SAT-/AL-/IAD-[cihaz]-[yıl]-[sıra]`, `MK-/SB-[cihaz]-[sıra]`. Sayaç Dexie `counters` tablosunda (şema v2), artış tek işlemde.
- **Not:** Eski `SRV-` öneki plana göre `S-` yapıldı. Tarayıcı verisi silinirse sayaç sıfırlanır; çakışmayı sunucudaki `UNIQUE (business_id, document_no)` yakalar.
- **Etki:** `src/lib/numbering.ts`, `src/lib/utils/id.ts`.

### K-004 · Para: kuruş cinsinden tam sayı
- **Plan:** "Decimal, yuvarlama" (Adım 1.9). Mevcut kod `number` (float) ile hesaplıyordu.
- **Karar:** Veritabanı `DECIMAL(15,4)`; kodda tüm hesaplamalar kuruş tam sayısıyla. Girdi metin üzerinden okunur (1.005 → 101 kuruş).
- **Etki:** `src/lib/calc.ts`; `utils/currency.ts` içindeki float fonksiyonlar `@deprecated`.

## 2026-10-20

### K-003 · Next.js 16, `proxy.ts`, `next-pwa` yok
- **Plan:** "Next.js 14". **Gerçek:** Next.js 16.4 (Turbopack). `middleware.ts` yerine `src/proxy.ts`.
- **Karar:** `next-pwa` Turbopack ile uyumsuz, kaldırıldı. PWA için kendi service worker'ımız Faz 6'da yazılacak. Plan dokümanı güncellendi.

### K-002 · Cihaz kaydı geçici olarak elle
- **Plan:** Cihaz kodu sunucuda atanır (FR-002). **Gerçek:** `useDevice.registerDevice` kodu istemcide üretiyor ve kurulum sihirbazı yok.
- **Karar:** Geliştirme ortamı için işletme/kullanıcı/cihaz kayıtları SQL ile elle eklendi. Sihirbaz ve sunucu tarafı atama Faz 1'de yapılacak (açık madde).

### K-001 · Test altyapısı
- **Karar:** Vitest kuruldu (`npm test`); tarayıcı veritabanı testleri için `fake-indexeddb`. Para, numaralandırma ve durum makinesi gibi iş kuralları testle yazılır.
