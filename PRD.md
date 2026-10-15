# Servis, Satış ve Stok Yönetimi Uygulaması — Ürün Gereksinim Dokümanı (PRD) v2.1

Sürüm 2.1 | Tarih: 15 Ekim 2026 | Dil: Türkçe | Para birimi: Türk Lirası (TRY)

Bu sürüm v2.0'ı ve inceleme notlarını esas alır. v2.0'daki eksik ve çelişkiler giderilmiş, v1.0'dan düşen ekran ve test gereksinimleri geri eklenmiştir. Değişikliklerin özeti Bölüm 23'te, işletmenin onayına sunulan varsayımlar Bölüm 24'tedir. Terim sözlüğü Ek A'dadır.

## 1. Ürün özeti

Uygulama; benzinli ağaç motoru (zincirli testere), benzinli ilaçlama motoru, benzinli tırpan, yedek parça, yağ, misina ve aksesuar satışını; arıza tespiti, bakım, tamir, montaj ve ilk çalıştırma hizmetlerini tek yerde takip eder. Temel amaç, her makinenin geçmişini unutmadan görmek, servis sürecini yönetmek, stok ve müşteri/tedarikçi bakiyelerini doğru tutmak ve telefon üzerinden hızlı işlem yapmaktır.

Birinci sürüm tek kullanıcılı kullanım için optimize edilir; veri modeli çok kullanıcılı ve çok cihazlı büyümeye hazır olmalıdır. Telefon ana cihazdır; bilgisayardan web erişimi de desteklenir. Kurulum yapılabilir web uygulaması (PWA) hedeflenir. İnternet kesintilerinde temel işler yerel olarak devam eder ve bağlantı geldiğinde eşitlenir. Uygulama bir muhasebe programı gibi ağır hissettirmemelidir: günlük işlemler az adımla yapılır, ayrıntılar gerektiğinde açılır.

### 1.1 Başarı hedefleri

- Mevcut müşteri ve makineyle yeni servis kaydı, normal koşullarda yaklaşık 30 saniyede açılabilmelidir.
- Yeni müşteri ve yeni makineyi de içeren kayıt için ayrı hedef: temel bilgiler hazırsa yaklaşık 90 saniye; zorunlu olmayan alanlar sonraya bırakılabilir.
- Makine QR kodu okutulduğunda makine, sahibi ve servis geçmişine; ürün QR kodu okutulduğunda stok ve fiyat bilgisine ulaşılmalıdır.
- Satış, tahsilat, borç ve stok hareketleri birbirinden ayrılmalı; geçmiş kayıtlar sessizce değiştirilmemelidir. Yanlış kayıt düzeltildiğinde işlem geçmişi korunmalıdır.
- Çevrimdışı işlem sonrasında eşitleme tekrarlı kayıt veya fark edilmeden veri kaybı üretmemelidir.
- Uygulama telefon ve bilgisayarda aynı işletme verilerini göstermelidir.

### 1.2 MVP kapsamı

- Müşteri ve makine kartları, makine geçmişi, mükerrer kayıt uyarısı ve QR etiketleri.
- Servis kabulü, teşhis, müşteri onayı, işçilik/parça, servis durumu, teslim ve servis fişi.
- Servis şablonları ve tekrar kullanılabilir arıza/işlem kütüphaneleri.
- Ürün kataloğu, stok hareketleri, hasarlı stok takibi, seri takipli makine birimleri, hızlı satış ve detaylı makine satışı.
- Hızlı ve detaylı satın alma girişi; tedarikçi ve borç takibi.
- Nakit, kart, EFT/havale, kısmi ödeme, ödeme tahsisi; veresiye/borç bakiyesi ve vade.
- İade, satış iptali ve düzeltmelerin ters kayıtlarla tutulması.
- Açılış verisi: Excel/CSV içe aktarma ve açılış stok/bakiye kayıtları.
- Çevrimdışı temel işlemler, eşitleme, günlük yedekleme, arama, uygulama içi bildirimler, temel raporlar ve PDF/XLSX/CSV dışa aktarma.
- Hesap/şifre ile giriş, cihaz PIN'i, cihaz yönetimi, audit log.

### 1.3 MVP dışı / sonraki sürümler

- Resmî e-fatura/e-arşiv entegrasyonu ve muhasebe yazılımı entegrasyonu.
- Müşteriye otomatik WhatsApp mesajı veya SMS gönderimi; gerçek telefon push bildirimleri.
- Gelişmiş kâr/maliyet analizi, ortalama maliyet muhasebesi ve nakit kasa mutabakatı. (Maliyet snapshot'ı MVP'de toplanır; analiz sonraki sürümdedir.)
- Parça-makine uyumluluğunun otomatik kataloğu; başlangıçta serbest notla belirtilebilir.
- Gelişmiş ekip/rol yönetimi; ancak temel kullanıcı, işletme ve cihaz modeli MVP'de bulunur.
- Garanti bakım kampanyaları ve otomatik periyodik bakım pazarlama akışları.
- Servis sırasında otomatik 'aynı arıza daha önce oldu' uyarısı verilmez; geçmiş kullanıcı tarafından görüntülenir (parent\_service\_id ile elle bağlanabilir).

## 2. Kullanıcılar ve kullanım ilkeleri

MVP kullanıcısı işletme sahibi/operatördür; ileride usta ve satış personeli eklenebilir. Kullanıcı teknik olmayan, günlük işine odaklanan bir işletme kullanıcısıdır.

- Arayüz mobil öncelikli, kısa formlu ve Türkçe olmalıdır. Zorunlu olmayan ayrıntılar giriş sırasında istenmemelidir.
- Telefon hızlı işlem cihazıdır; bilgisayar geniş ekranlı kayıt ve rapor kullanımını destekler. İnternet bağlantısı kesintili olabilir.
- Kritik işlem onayı gerekir: iade, satış/servis iptali, stok düzeltme, kayıt arşivleme, açılış bakiyesi değişikliği, cihaz iptali, veri dışa aktarma ve yedekten geri yükleme.
- Düzeltme mümkün olduğunda silme yerine ters kayıt veya denetim kaydı kullanılır.
- Kayıtlar işletmeye aittir; dışa aktarma ve erişim işletme hesabı tarafından kontrol edilir.
- MVP tek kullanıcılı olduğundan fiyat değiştirme, indirim ve iptal gibi işlemler için ayrı yetki katmanı yoktur; bu işlemler kritik işlem onayıyla ve audit log ile korunur. Rol bazlı yetki sonraki sürümdedir.

## 3. Bilgi mimarisi ve ana ekran

Ana ekranda belirgin hızlı eylemler: Yeni Servis, Yeni Satış, Ara, QR Tara. Hızlı eylemlerin altında küçük bir 'Bugünün durumu' alanı yer alır. Alt gezinme: Ana Sayfa, Servisler, Satışlar, Stok, Müşteriler. Tedarikçiler, raporlar, ayarlar, yedekleme ve yardım ikincil menüdedir. Ana ekranda eşitleme durumu göstergesi (bekleyen kayıt sayısı, son başarılı eşitleme) her zaman görünür.

Ana ekran metrikleri:

| Metrik | Hesaplama |
| --- | --- |
| Bugünkü satış | Bugün kaydedilen (kesinleşmiş) satış belgelerinin net tutarı; iade ve iptaller ayrı gösterilir ve net toplamda düşülür. |
| Bugünkü tahsilat | Bugün fiilen alınan ödeme hareketlerinin toplamı; veresiye satış tutarı tahsilat sayılmaz. |
| Aktif servis | İptal edilmemiş ve teslim edilmemiş servis emirlerinin sayısı. |
| Onay bekleyen | Müşteri onayı bekleyen servis emirlerinin sayısı. |
| Parça bekleyen | Parça bekleniyor durumundaki servis sayısı. |
| Teslim tarihi yaklaşan/geçen | Vaat edilen teslim tarihi hatırlatma penceresine giren veya geçmiş servisler (varsayılan pencere 1 gün). |
| Kritik stok | Etkin ürünlerde satılabilir stok miktarı kritik seviyeye eşit veya altına düşen ürün sayısı. |

Küresel arama; müşteri adı/telefonu, makine iç numarası/seri numarası, servis numarası, ürün adı/kodu, satış ve tedarikçi üzerinden arar. Sonuçlar türüne göre etiketlenir. Arşivlenmiş kayıtlar varsayılan olarak aranmaz; 'arşivde de ara' seçeneğiyle bulunur. Çevrimdışıyken yalnızca cihazda mevcut olan yerel kayıtlar aranabilir; bu durum arayüzde açıklanır.

## 4. Ekran gereksinimleri

### 4.1 Müşteri listesi ve müşteri profili

- Liste: ad-soyad, telefon, açık bakiye göstergesi ve hızlı arama.
- Temel alanlar ad-soyad, telefon ve adres/köydür; telefonu olmayan müşteri için 'telefon yok' işareti kullanılır. Müşteri fotoğrafı ve notlar isteğe bağlıdır. Gereksiz kişisel bilgi (örn. T.C. kimlik numarası) istenmez.
- Telefon numaraları karşılaştırma için normalize edilir (boşluk, tire, parantez temizlenir; 0 ile başlayan ve +90 ile başlayan biçimler aynı kabul edilir). Aynı telefonla kayıtlı müşteri varsa mevcut müşteri önerilir; kullanıcı yine de bilinçli olarak yeni kayıt açabilir.
- Profil: makineler, servis geçmişi, satışlar, ödemeler, bakiye ve hareket dökümü, hızlı işlem bağlantıları. 'Ara' ve 'WhatsApp'ta aç' bağlantıları bulunur; bunlar elle mesaj açar, otomatik gönderim değildir.
- Açık servisi veya sıfır olmayan bakiyesi olan müşteri arşivlenemez; kullanıcı önce uyarılır (Bölüm 7.5).

### 4.2 Makine listesi ve makine profili

- Makine türü, marka ve model temel alanlardır. Seri numarası varsa kaydedilir; yoksa sistem benzersiz iç makine numarası üretir. Aynı markada aynı seri numarası mevcutsa uyarı verilir; kullanıcı onayıyla devam edebilir.
- Profil: sahibi, seri/iç numara, tür/marka/model, satış bilgisi, garanti bitiş tarihi ve bilgi amaçlı garanti durumu (kapsam kullanıcı tarafından doğrulanır), tamamlanan servis sayısı, son servis/bakım tarihi, servis geçmişi, sahiplik geçmişi, notlar ve isteğe bağlı fotoğraf.
- İşlemler: Yeni Servis, QR göster/tara, Düzenle, Sahip değiştir, Birleştir (geçici makine kaydı için).
- Makine sahibi değiştiğinde makine kaydı ve servis geçmişi korunur; yalnızca ilişkili müşteri güncellenir ve MachineOwnershipHistory kaydı oluşur.
- Servis ziyareti fotoğrafı isteğe bağlıdır; her ziyaret için zorunlu değildir.

### 4.3 Servis listesi ve servis detayı

- Liste: aktif, tamamlanmış ve iptal edilmiş sekmeleri; durum rozeti, vaat edilen teslim tarihi ve bakiye göstergesi.
- Detay sekmeleri: Özet (müşteri, makine, durum, tarihler), Arıza ve teşhis, İşlemler ve parçalar, Onaylar, Kontrol listesi, Ödemeler, Geçmiş (durum geçmişi ve audit).
- Makine seçildiğinde son servis tarihi, son yapılan işlem ve servis sayısı kısa geçmiş özeti olarak gösterilir.
- Arıza ön tanımlı listeden seçilir; 'Diğer' ve serbest metin vardır. Bir serviste birden fazla arıza, işlem ve parça satırı olabilir. Teşhis ve yapılacak işlemler ayrı alanlardır.
- İşlem kataloğundaki önerilen fiyat otomatik dolar, değiştirilebilir. Parça ve işçilik tutarları sistem içinde ayrı tutulur; müşteri fişinde varsayılan olarak toplam gösterilir.
- Fiyat henüz bilinmiyorsa 'fiyat bekleniyor' olarak işaretlenebilir (kural SR-007).

### 4.4 Ürün ve stok ekranları

- Ürün kartı: ad, kategori, marka/model, birim, satılabilir stok, hasarlı/karantina stok, satış fiyatı, son alış fiyatı, ürün kodu, kritik stok seviyesi, varsayılan KDV oranı/modu, uyumlu modeller notu; isteğe bağlı fotoğraf ve raf/konum.
- Detay sekmeleri: Hareketler, Alışlar, Satışlar, Hasarlı stok; seri takipli ürünlerde ayrıca Seri birimler.
- Her stok hareketi kaynak işlemle ilişkilendirilir: satın alma, satış, serviste kullanım, iade, iptal veya stok düzeltme.
- Stok düzeltme ekranında önceki miktar, yeni miktar, fark, neden (zorunlu), tarih ve onay adımı bulunur.
- Kritik stok seviyesi ürün bazında ayarlanır.

### 4.5 Satış, ödeme ve cari hesap ekranları

- Satışlar: hızlı satışlar, makine satışları, taslaklar, tahsilatlar ve satış geçmişi.
- Ödeme ekranı: birden fazla ödeme yöntemi, kısmi tahsilat, vade tarihi (isteğe bağlı). Müşteri profilinden belgesiz genel tahsilat alınabilir; sistem tahsis önizlemesi gösterir (Bölüm 9.4).
- Müşteri profilinde toplam bakiye, belge bazlı açık tutarlar ve ödeme geçmişi görünür.

### 4.6 Tedarikçi ekranları

Tedarikçi profilinde satın alma geçmişi, yapılan ödemeler, iadeler, açılış bakiyesi ve kalan borç gösterilir.

### 4.7 Ayarlar ve yardım

- Temel ayarlar ve gelişmiş ayarlar ayrı sunulur. Temel: işletme adı, telefon, adres, logo, varsayılan KDV modu, fiş alt metni/teslim koşulları. Gelişmiş: onay eşiği, teslim hatırlatma günü, negatif stok izni, fotoğraf limitleri, belge numaralandırma, çevrimdışı azami gün, yedek ayarları.
- İlk kurulum adım adım yapılır (Bölüm 16, FR-002); sonradan düzenlenebilir.
- Türkçe, TL ve Türkiye tarih biçimi varsayılandır.
- Yardım alanında kısa kullanım açıklamaları, çevrimdışı çalışma sınırlamaları ve ayrı yardım bölümü bulunur.

### 4.8 Eşitleme, yedek ve bildirim merkezi

Tek bir ekranda son başarılı eşitleme zamanı, bekleyen ve hatalı kayıt sayısı, çakışma kuyruğu, son yedek tarihi/durumu ve bildirim listesi görünür. Dışa aktarma ve geri yükleme işlemleri buradan başlatılır.

## 5. Temel kullanıcı akışları

### 5.1 Yeni servis

1. Yeni Servis seçilir.
2. Mevcut müşteri seçilir veya yeni müşteri adı, telefon ve adres/köy bilgisiyle oluşturulur (mükerrer telefon uyarısı çalışır).
3. Müşterinin makineleri listelenir; mevcut makine seçilir, QR ile bulunur veya yeni makine açılır.
4. Müşteri şikâyeti kaydedilir; arıza/işlem kataloğu seçilebilir veya serbest metin girilebilir.
5. Gerekirse kabul fotoğrafı, mevcut hasar ve makineyle bırakılan aksesuarlar kaydedilir.
6. Kayıt açılır; teşhis, önerilen işler, tahmini fiyat, onay, parça ve teslim süreci daha sonra tamamlanabilir.

### 5.2 Servis tamamlama ve teslim

1. Teşhis kaydedilir ve bir veya daha fazla işlem eklenir.
2. Müşteriye sunulan kalemler ve fiyatlar onay için işaretlenir; kabul/ret/ertelemeler yöntem, tarih, tutar ve açıklamayla kaydedilir.
3. Parça kullanımı ServicePart satırlarıyla kaydedilir; stok yalnızca parça fiilen kullanıldığında düşülür.
4. İşçilik ve parça tutarları hesaplanır; onaylanmayan kalemler toplam tutara girmez.
5. Servis işi tamamlanır. Borç kalmış olsa da teslim edilebilir; teslim anında kalan bakiye açıkça gösterilir ve teslim/borç kabulü kaydedilir. Teslim alan kişi (müşteri değilse adı) kaydedilir.
6. Ödeme ve teslim kayıtları oluşturulur; servis sonuç özeti/fişi yazdırılabilir.

### 5.3 Hızlı satış ve makine satışı

Hızlı satışta müşteri zorunlu değildir; ürün ve miktar seçilir, indirim varsa uygulanır, ödeme yöntemi ve alınan tutar girilir. Tahsil edilmemiş tutar kalıyorsa müşteri seçimi zorunludur: kullanıcı mevcut müşteriyi seçer veya hızlıca yeni müşteri açar. Sahibi olmayan ('genel') alacak oluşturulamaz.

Seri numarası takip edilen makine satışında stoktaki belirli bir seri birim (ProductSerialUnit) seçilir; satış kesinleştiğinde bu birim SOLD durumuna geçer ve ilgili Machine kaydı müşteriyle ilişkilendirilir. Makine kaydı satıştan önce mevcutsa aynı kayıt kullanılır; çift makine kaydı oluşturulmaz. Seri numarası olmayan makinelerde birim kaydı yine oluşur ve sistem iç numara üretir.

## 6. Servis iş kuralları

| ID | Kural |
| --- | --- |
| SR-001 | Servis emri; müşteri, makine, şikâyet, oluşturulma tarihi ve benzersiz servis kimliği içerir. Makine henüz belirlenemiyorsa geçici makine kaydı (Machine.status = TEMPORARY) açılabilir; geçici kayıt SR-016'ya göre gerçek makineye dönüştürülür veya birleştirilir. |
| SR-002 | Şikâyet, teşhis ve yapılan işlem farklı alanlarda tutulur. |
| SR-003 | Bir servis emrinde birden fazla arıza, işlem ve parça satırı olabilir. |
| SR-004 | Onay eşiği: Onaylanmamış ücretli kalemlerin toplamı işletme ayarındaki onay eşiğini aşıyorsa (başlangıç önerisi 1.000 ₺; 0 = her ücretli işte onay) işlem başlamadan müşteri onayı alınır. Eşiğin altında onay kaydı isteğe bağlıdır. Onay yöntemi (yüz yüze/telefon/diğer), tarih-saat, onaylanan tutar ve açıklama saklanır. Onayı gereken servis, onay kaydı olmadan 'Teşhis tamamlandı' durumundan 'İşlemde' durumuna geçirilemez. |
| SR-005 | Teklifteki tutar yükselirse (ek iş veya fiyat artışı) yükselen tutarı kapsayan yeni onay gerekir; servis 'Müşteri onayı bekleniyor' durumuna alınır (İşlemde durumundan da geçiş mümkündür). Onaylanan tutarın üstünde işlem yapılmaz; ayarlanabilir tolerans (varsayılan 0) içinde veya acil/istisna gerekçesi kaydedilerek aşım yapılabilir. |
| SR-006 | Her işlem kalemi onaylandı, reddedildi veya ertelendi durumlarından birini taşır. Reddedilen/ertelenen kalem toplam ücrete dahil edilmez. |
| SR-007 | Fiyat bilinmiyorsa 'fiyat bekleniyor' işareti kullanılır. Fiyatı bekleyen ücretli kalem varken servis 'İş tamamlandı' durumuna geçirilemez. Kalem açıkça ücretsiz veya garanti kapsamlı işaretlenirse geçiş yapılabilir. |
| SR-008 | Stok düşümü, parça önerildiğinde değil ServicePart.used\_quantity > 0 olarak fiilen kullanıldığı kaydedildiğinde oluşur. |
| SR-009 | Servis sayacı tamamlanan servislerden türetilir: ServiceOrder.first\_completed\_at dolu ve durumu İptal edildi olmayan servisler sayılır. Yeniden açma sayaçta ikinci artış oluşturmaz; sonradan iptal edilen servis sayaçtan düşer ve geçmişi korunur. |
| SR-010 | Makine daha önceki servisle ilişkilendirilebilir: parent\_service\_id alanı tekrar arıza, garanti dönüşü veya ek iş için kullanılır. |
| SR-011 | Garanti kapsamındaki işte warranty\_claim bayrağı, garanti kaynağı ve kapsam açıklaması tutulur. Uygulama makine kartındaki garanti bitişini gösterir; garanti kapsamı kullanıcı tarafından doğrulanır. Onaylı garanti işi için müşteri ücreti sıfır olabilir; kullanılan parçanın stok çıkışı ve maliyet snapshot'ı (unit\_cost\_snapshot) yine kaydedilir. |
| SR-012 | Kabul kaydı aksesuarlar, mevcut hasar/çizikler, teslim alan kişi ve müşteri beyanını tutabilir. Bunlar zorunlu olmayan fakat kabul fişinde sunulan alanlardır. |
| SR-013 | Servis durum değişikliklerinin her biri tarih-saat, eski durum, yeni durum, kullanıcı/cihaz ve notla ServiceStatusHistory içinde saklanır. |
| SR-014 | Teslim tarihi yaklaşma bildirimi varsayılan olarak 1 gün önce, gecikmişse teslim kaydı oluşana kadar günde bir kez gösterilir; ayarlardan değiştirilebilir. |
| SR-015 | Teslim alınmayan makine için MVP'de otomatik hukuki tasfiye/ücret politikası yoktur. Teslim gecikmesi görünür yapılır; işletme kendi sözleşme ve mevzuat uygulamasını belirler. |
| SR-016 | Geçici makine kaydı gerçek makineye dönüştürülürken (seri/iç numara, marka, model tamamlanır) kayıt ACTIVE olur. Aynı makine zaten kayıtlıysa 'Birleştir' ile geçici kaydın servisleri hedef makineye taşınır, geçici kayıt arşivlenir ve işlem audit log'a yazılır. |
| SR-017 | Servis iptali gerekçe ve onay gerektirir. İptal edilen serviste kullanılmış parçanın stoğu otomatik geri eklenmez; fiziksel durum Bölüm 9.7'ye göre ayrıca değerlendirilir. İptalde isteğe bağlı 'inceleme/teşhis ücreti' kalemi eklenebilir; bu kalem tahakkuk eder, servis iptal olarak kalır ve servis sayacı artmaz. Alınmış ön ödeme/kapora iade edilir veya müşteri alacağına yazılır (Bölüm 9.7). |
| SR-018 | Servis kabulünde alınan kapora/ön ödeme, service\_order\_id'ye bağlı bir Payment kaydıdır ve servisin ödenen tutarına dahildir. |
| SR-019 | ServicePart.supply\_status değerleri: IN\_STOCK, TO\_ORDER, ORDERED, ARRIVED. Servis, TO\_ORDER veya ORDERED parçası olduğu sürece 'Parça bekleniyor' durumunda kalabilir; beklenen tarih (expected\_at) ve isteğe bağlı sipariş/satın alma kalemi bağlantısı tutulur. Tüm parçalar ARRIVED/IN\_STOCK olunca bekleme bildirimi çözülür. |

### 6.1 Servis durumları ve geçişler

| Durum | İzin verilen sonraki durumlar / not |
| --- | --- |
| Kabul edildi | Teşhis bekleniyor, Teşhis tamamlandı (teşhis kabulde girildiyse), İptal edildi |
| Teşhis bekleniyor | Teşhis tamamlandı, İptal edildi |
| Teşhis tamamlandı | Müşteri onayı bekleniyor, İşlemde (onay gerekmiyorsa veya alındıysa), Parça bekleniyor, İptal edildi |
| Müşteri onayı bekleniyor | İşlemde, Parça bekleniyor, Teşhis tamamlandı (teklif değişikliği), İptal edildi |
| İşlemde | Parça bekleniyor, Müşteri onayı bekleniyor (ek iş/fiyat artışı), İş tamamlandı, İptal edildi |
| Parça bekleniyor | İşlemde, İptal edildi |
| İş tamamlandı | Teslim edildi, İşlemde (yeniden açma; neden zorunlu), İptal edildi (neden zorunlu; ücret iadesi akışı) |
| Teslim edildi | İşlemde (yeniden açma; neden zorunlu). Teslim edilmiş servis iptal edilemez; ücret düzeltmesi Bölüm 9.7'deki servis iadesiyle yapılır. |
| İptal edildi | Terminal durum. Yeniden çalışma için yeni servis emri açılır ve parent\_service\_id ile bağlanır. |

Ödeme ayrı bir finansal boyuttur: ödenen tutar, kalan bakiye ve ödeme durumu (ödenmedi/kısmen ödendi/tam ödendi/iade edildi) ödeme kayıtlarından türetilir; servis iş durumu içine 'ödeme bekleniyor' eklenmez. Borçlu teslim MVP'de mümkündür; teslim sırasında kalan borç ve müşterinin bunu kabul ettiği görünür biçimde kaydedilir.

### 6.2 Şablonlar ve kontrol listeleri

Servis şablonu uygulandığında her madde ServiceChecklistItem kaydı olarak servis emrine kopyalanır. Şablon sonradan değişse bile açık servislerdeki kopya değişmez. Her madde başlık, sıra, zorunlu/isteğe bağlı, tamamlandı durumu, tamamlayan kullanıcı/cihaz ve zaman bilgisi taşır. Kullanıcı serviste adım ekleyebilir, kaldırabilir ve tamamlandı işaretleyebilir. Zorunlu madde tamamlanmadan 'İş tamamlandı' durumuna geçişte uyarı verilir.

## 7. Veri modeli

Aşağıdaki varlıklar mantıksal modelin asgari kapsamıdır. Tüm işletmeye ait kayıtlar business\_id taşır. Çevrimdışı oluşturulan kayıtlarda sunucudan bağımsız UUID kullanılır; görünen belge numarası ayrı alandır. Her kayıt ayrıca created\_at, updated\_at, version ve sync\_state alanlarını taşır (Bölüm 7.4).

| Varlık | Önemli alanlar / ilişkiler |
| --- | --- |
| Business | id, name, phone, address, logo\_ref, currency, timezone, created\_at |
| User | id, business\_id, login, email, password\_hash/provider\_id, status, role, recovery\_channel; MVP'de tek aktif kullanıcı olabilir |
| Device | id, business\_id, user\_id, device\_uuid, device\_code (sunucuca atanır), platform, last\_sync\_at, revoked\_at, wipe\_confirmed\_at, local\_key\_metadata |
| Customer | id, business\_id, name, phone, normalized\_phone, no\_phone\_flag, address/village, notes, optional\_photo\_ref, archived\_at |
| Machine | id, business\_id, customer\_id, type, brand, model, serial\_number?, internal\_number, status (TEMPORARY, ACTIVE, INACTIVE), sale\_date?, sale\_price?, warranty\_end?, notes?, photo\_refs?, archived\_at |
| MachineOwnershipHistory | id, business\_id, machine\_id, old\_customer\_id, new\_customer\_id, changed\_at, reason, actor\_id/device\_id |
| ServiceOrder | id, business\_id, document\_no, customer\_id, machine\_id, parent\_service\_id?, complaint, diagnosis, status, accepted\_at, promised\_at?, first\_completed\_at?, delivered\_at?, received\_by?, warranty\_claim, cancel\_reason?, labor\_total, parts\_total, discount\_total, tax\_total, total\_amount, created\_at, archived\_at? |
| ServiceIssue | id, business\_id, service\_order\_id, issue\_catalog\_id?, description, outcome |
| ServiceOperation | id, business\_id, service\_order\_id, operation\_catalog\_id?, description, approval\_status, labor\_amount, price\_status, warranty\_covered, tax\_mode, tax\_rate?, discount\_amount, line\_total, sort\_order |
| ServicePart | id, business\_id, service\_order\_id, service\_operation\_id?, product\_id?, description\_snapshot, source\_type, source\_customer\_id?, quantity, unit, unit\_price\_snapshot, unit\_cost\_snapshot?, discount\_amount, tax\_mode, tax\_rate?, line\_total, used\_quantity, returned\_quantity, supply\_status, expected\_at?, purchase\_item\_id?, stock\_movement\_id?, approval\_status |
| ServiceApproval | id, business\_id, service\_order\_id, operation\_id?, part\_id?, decision, method, approved\_amount, decided\_at, explanation |
| ServiceStatusHistory | id, business\_id, service\_order\_id, from\_status, to\_status, changed\_at, actor\_id?, device\_id?, note |
| ServiceChecklistItem | id, business\_id, service\_order\_id, template\_item\_id?, title\_snapshot, required, is\_completed, completed\_at, completed\_by, note |
| OperationCatalog | id, business\_id, name, category, suggested\_price?, default\_duration?, active |
| IssueCatalog | id, business\_id, name, category, active |
| ServiceTemplate | id, business\_id, name, machine\_type?, active |
| ServiceTemplateItem | id, business\_id, template\_id, title, required, sort\_order |
| Product | id, business\_id, name, category, brand?, model?, code?, unit, stock\_qty (satılabilir), damaged\_qty (hasarlı/karantina), critical\_stock\_level, sale\_price, last\_purchase\_price, default\_tax\_mode?, default\_tax\_rate?, compatible\_models\_note?, photo\_ref?, storage\_location?, tracks\_serial, active |
| ProductSerialUnit | id, business\_id, product\_id, serial\_number?, internal\_number, status (IN\_STOCK, SOLD, DAMAGED, RETURNED\_TO\_SUPPLIER), purchase\_item\_id?, sale\_item\_id?, machine\_id? |
| StockMovement | id, business\_id, product\_id, serial\_unit\_id?, bucket (AVAILABLE, DAMAGED), movement\_type, quantity\_delta, quantity\_before, quantity\_after, unit, unit\_cost\_snapshot?, source\_type, source\_id, reason, occurred\_at, device\_id, reversal\_of\_id? |
| Supplier | id, business\_id, name, phone?, address?, notes?, archived\_at |
| Purchase | id, business\_id, document\_no, supplier\_id?, purchase\_date, total\_amount, status (DRAFT, RECEIVED, CANCELLED), notes |
| PurchaseItem | id, business\_id, purchase\_id, product\_id?, description\_snapshot, quantity, unit, unit\_price, line\_discount, tax\_mode?, tax\_rate?, line\_total, stock\_movement\_id? |
| Sale | id, business\_id, document\_no, customer\_id?, sale\_date, subtotal, discount\_total, tax\_total, total\_amount, status (DRAFT, FINAL, CANCELLED), cancel\_reason? |
| SaleItem | id, business\_id, sale\_id, product\_id?, serial\_unit\_id?, machine\_id?, description\_snapshot, quantity, unit, unit\_price\_snapshot, unit\_cost\_snapshot?, discount\_amount, tax\_mode, tax\_rate?, line\_total, stock\_movement\_id? |
| Payment | id, business\_id, customer\_id?, supplier\_id?, direction (IN, OUT), method (CASH, CARD, BANK\_TRANSFER, OTHER), amount, occurred\_at, reference?, status (POSTED, REVERSED), reversal\_of\_id?, sale\_id?, purchase\_id?, service\_order\_id? |
| PaymentAllocation | id, business\_id, payment\_id, target\_type (SALE, SERVICE, PURCHASE, OPENING\_BALANCE), target\_id, amount |
| ReturnTransaction | id, business\_id, document\_no, original\_type, original\_id, return\_date, reason, refund\_method (CASH, CARD, BANK\_TRANSFER, OTHER, CUSTOMER\_CREDIT), total\_amount, status (POSTED, REVERSED), created\_by\_device |
| ReturnItem | id, business\_id, return\_id, original\_line\_type, original\_line\_id, product\_id?, serial\_unit\_id?, quantity, unit, amount, stock\_disposition (SELLABLE, DAMAGED, NOT\_RETURNED), stock\_movement\_id? |
| OpeningBalance | id, business\_id, party\_type (CUSTOMER, SUPPLIER), party\_id, direction (OWED\_BY\_PARTY, OWED\_TO\_PARTY), amount, as\_of\_date, source\_note, import\_batch\_id? |
| Notification | id, business\_id, type, related\_record\_id, created\_at, read\_at?, resolved\_at?, dedupe\_key |
| AuditLog | id, business\_id, actor\_id?, device\_id?, entity\_type, entity\_id, action, before\_snapshot?, after\_snapshot?, reason?, occurred\_at |
| SyncMetadata | business\_id, device\_id, last\_successful\_sync, pending\_count, failed\_count, last\_error? |
| ImportBatch | id, business\_id, file\_name, file\_hash, imported\_at, row\_count, error\_count, status |
| BusinessSettings | business\_id, default\_tax\_mode, approval\_threshold\_amount, approval\_tolerance, delivery\_reminder\_days, allow\_negative\_stock, max\_offline\_days, photo\_limits, numbering\_settings, receipt\_terms\_text, paper\_format, backup\_settings |

### 7.1 Serbest veya müşteri tarafından getirilen parça

ServicePart.product\_id boş olabilir. source\_type değerleri: STOCK\_PRODUCT, CUSTOMER\_SUPPLIED, NON\_STOCK\_PURCHASE, OTHER. Ürün kartı olmayan serbest parça için açıklama, birim, miktar ve fiyat anlık görüntüsü zorunludur. Müşterinin getirdiği parça stoktan düşmez ve müşteriye parça bedeli yazılmayabilir; işçilik ayrı kaydedilir. Stok ürünü için ürün adı, birim ve birim fiyat işlem anında snapshot olarak saklanır.

### 7.2 Fiyat, maliyet ve tarihsel kayıtlar

Satış/servis kalemlerinde birim fiyat, indirim, vergi modu/oranı ve satır toplamı işlem anında saklanır. Ürün fiyatı veya katalog fiyatı sonradan değişse bile geçmiş belgeler değişmez. Stok çıkışı yapan satış, servis ve hareket satırlarında işlem anındaki son alış fiyatı unit\_cost\_snapshot olarak saklanır (bilinmiyorsa boş). Bu alan MVP raporlarında ve müşteri çıktısında kullanılmaz; Sürüm 2 kârlılık analizlerinin geriye dönük çalışabilmesi için toplanır.

total\_amount belge üzerinde saklanan ve kayıt anında doğrulanan toplamdır. Toplam, vergi, indirim ve yuvarlama hesabı istemci ve sunucuda aynı paylaşılan hesaplama modülüyle yapılır; hesaplama sürümü belgeyle birlikte saklanır. Sunucu eşitlemede farklı bir sonuç bulursa belgeyi sessizce değiştirmez ve reddetmez; belge 'toplam uyuşmazlığı' olarak çakışma kuyruğuna alınır, kullanıcıya iki tutar gösterilir ve karar kullanıcıdan istenir. Çevrimdışı basılmış fişteki tutar bu karar verilene kadar geçerli kabul edilir.

Ödenen ve kalan tutarlar (paid\_amount, balance) PaymentAllocation ve Payment kayıtlarından hesaplanan değerlerdir; belge üzerinde tutuluyorsa yalnızca önbellektir ve eşitleme sonrası yeniden doğrulanır.

### 7.3 Belge numaraları

İş kayıtlarının iç kimliği UUID'dir; belge numarası eşitleme ve sıralama için kimlik olarak kullanılmaz. Belge numaraları çevrimdışıyken de benzersiz üretilecek biçimde cihaz kısa kodu içerir:

- Servis: S-\[cihaz kodu\]-\[yıl\]-\[sıra\] (örnek S-A7-2026-00012)
- Satış: SAT-\[cihaz kodu\]-\[yıl\]-\[sıra\]
- Satın alma: AL-\[cihaz kodu\]-\[yıl\]-\[sıra\]
- İade: IAD-\[cihaz kodu\]-\[yıl\]-\[sıra\]
- Makine iç numarası: MK-\[cihaz kodu\]-\[sıra\]
- Ürün seri birimi iç numarası: SB-\[cihaz kodu\]-\[sıra\]

Cihaz kodu işletme içinde benzersizdir ve sunucu tarafından atanır; bu yüzden yeni cihaz ilk kurulumda çevrimiçi olmalıdır. Uygulama verisi silinip yeniden kurulursa cihaz yeni Device kaydı ve yeni kod alır; eski kod iptal edilir. Böylece sıra sayacı yinelenmez. Sunucu yine de çakışma tespit ederse iç UUID'yi korur ve yalnızca çakışan görünen numarayı yeni bir numarayla değiştirir; eski numara AuditLog'a yazılır ve belge detayında eski numara aranabilir. Numara boşlukları kabul edilir; ardışıklık garanti edilmez.

### 7.4 Teknik veri kuralları

- Para tutarları kayan noktalı sayı yerine decimal/numeric türünde tutulur; kuruş hassasiyeti uçtan uca korunur.
- Tarih-saatler UTC saklanır ve kullanıcıya Europe/Istanbul saatinde gösterilir. Cihaz saati güvenilir kabul edilmez: kayıtlarda istemci zamanı (occurred\_at) ile sunucu alım zamanı ayrı tutulur ve çakışma kontrolü saate değil version/revision alanına dayanır.
- Her kayıtta kalıcı UUID, created\_at, updated\_at, version ve sync\_state bulunur.
- Stok bakiyesi (Product.stock\_qty ve damaged\_qty), StockMovement kayıtlarından yeniden hesaplanıp doğrulanabilir olmalıdır; fark bulunursa hareketler esas alınır ve audit log'a yazılır.
- Geçmiş fiyatlar ilgili satış/servis/satın alma kaleminde sabitlenir.

### 7.5 Arşivleme ve silme

Arşivleme, kaydı normal listelerden ve varsayılan aramadan gizler; ilişkili tarihçe, finans/stok kayıtları ve raporlar bozulmaz. Arşivlenen kayıt geri alınabilir ve 'arşivde de ara' ile bulunur. Açık servisi veya sıfır olmayan bakiyesi olan müşteri, açık servisi olan makine, stoğu veya açık hareketi olan ürün arşivlenemez; kullanıcı nedenle uyarılır. Kalıcı silme normal kullanıcı akışı değildir. Kişisel veri silme/anonimleştirme talebi gelirse finans ve stok kayıtları bütünlüğü korunarak kişi bilgileri anonimleştirilir; politika Bölüm 12'deki KVKK incelemesiyle belirlenir.

## 8. Stok kuralları

| ID | Kural |
| --- | --- |
| ST-001 | Stok miktarı her zaman birimle birlikte saklanır. Adet, metre, litre, kilogram gibi birimler desteklenir. Ondalıklı miktar desteklenir; hassasiyet birime göre belirlenir (adet varsayılan tam sayı, metre/litre en fazla 3 ondalık). |
| ST-002 | Negatif stok MVP varsayılanında engellenir. Kullanılabilir stok, eşitlenmiş ve yerel bekleyen hareketler dahil cihazın bildiği satılabilir (AVAILABLE) miktardır. İşlem stok yetersizliği yaratıyorsa kullanıcıya uyarı verilir ve varsayılan olarak işlem engellenir. |
| ST-003 | İnternetsiz iki cihazın aynı son ürünü tüketmesi merkezi olarak önceden engellenemez. Eşitleme sonrası stok negatif kalacaksa hareketler silinmez; çakışma kuyruğu açılır, stok düzeltme/işlem iptali gibi kullanıcı onaylı telafi gerekir. Bu risk ve çözüm kaydı görünür olmalıdır. |
| ST-004 | İşletme ayarıyla negatif stoka izin verilirse işlem kullanıcı onayıyla yapılır, neden kaydedilir ve kritik uyarı gösterilir. Varsayılan kapalıdır. |
| ST-005 | Her stok hareketi kaynak, kaynak kayıt kimliği, bucket (AVAILABLE/DAMAGED), miktar farkı, önceki/sonraki miktar, birim, tarih, neden, cihaz, maliyet snapshot'ı ve gerekiyorsa ters hareket bağlantısı taşır. |
| ST-006 | Satış stoğu satış kesinleştiğinde (FINAL); servis stoğu parça fiilen kullanıldığında; satın alma stoğu kayıt RECEIVED olduğunda (mal kabulü) etkiler. Taslak (DRAFT) belge stok ve finans hareketi üretmez. |
| ST-007 | İade edilen ürünün durumu: SELLABLE (AVAILABLE stoğa döner), DAMAGED (satılabilir stoğa dönmez; DAMAGED bucket'ına, yani Product.damaged\_qty'ye yazılır), NOT\_RETURNED (stok hareketi yok). |
| ST-008 | Stok düzeltmesinde önceki miktar, yeni miktar, fark, neden (zorunlu), tarih ve kullanıcı/cihaz tutulur; kritik işlem onayı gerekir. Geçmiş hareketler silinmez, düzeltme yeni hareket olarak eklenir. |
| ST-009 | Kritik stok uyarısı AVAILABLE miktar kritik seviyeye ilk eşit veya altına indiğinde oluşur. Miktar kritik değerin üstüne çıktığında uyarı çözülür. Çözülmeden tekrar tekrar bildirim üretilmez; yeniden eşik altına düşerse yeni uyarı oluşur. Hasarlı stok kritik stok hesabına dahil edilmez. |
| ST-010 | Parça-makine uyumluluk kataloğu MVP dışıdır; ürün kartında uyumlu modeller serbest metinle not edilebilir. |
| ST-011 | Hasarlı (DAMAGED) stoktan çıkış yalnızca stok düzeltme türleriyle yapılır: satılabilire aktarma (onarıldı), tedarikçiye iade, imha/hurda. Her biri çift hareket (kaynak bucket çıkışı, hedef bucket girişi) veya tek çıkış olarak kaydedilir ve neden zorunludur. |
| ST-012 | Seri takipli ürünlerde (tracks\_serial = true) her fiziksel birim ProductSerialUnit kaydıdır ve stok miktarı IN\_STOCK birim sayısına eşittir. Satın alma kalemi miktar kadar birim üretir; seri numarası satın alma sırasında veya sonradan girilebilir, girilmezse sistem iç numara (SB-...) üretir. Satışta belirli bir birim seçilir; aynı birim iki kez satılamaz (çevrimdışı çift satış eşitlemede çakışma kuyruğuna düşer). İade SELLABLE ise birim IN\_STOCK, DAMAGED ise DAMAGED durumuna geçer. |
| ST-013 | Stok bakiyesi hareket defterinden yeniden hesaplanabilir olmalıdır (Bölüm 7.4); fark bulunursa hareketler esas alınır. |

### 8.1 Başlangıç katalogları

İlk kurulumda aşağıdaki örnek kategoriler hazır gelir; kullanıcı ekleyebilir, adını değiştirebilir veya pasifleştirebilir. Kullanılmış geçmiş satırların açıklamaları geriye dönük değişmez.

- Ürün: makineler, yağlar, misina, buji, hava filtresi, yakıt filtresi, karbüratör, marş grubu, debriyaj, bıçak, misina başlığı, zincir, pala, dişli/şaft, aksesuar, koruyucu ekipman, diğer.
- İşlem: arıza tespiti, genel bakım, karbüratör temizliği/ayarı, filtre değişimi, buji değişimi, ip/marş tamiri, bıçak/zincir/pala işlemi, montaj, ilk çalıştırma, motor testi, diğer.
- Arıza: çalışmıyor, zor çalışıyor, güç kaybı, stop ediyor, yakıt kaçağı, yağlama sorunu, titreşim/ses, kesmiyor/biçmiyor, parça kırığı/hasarı, bakım talebi, diğer.

### 8.2 Fotoğraf ve raf konumu

Fotoğraf alanları MVP'de isteğe bağlıdır. Müşteri fotoğrafı yalnızca işletmenin kişiyi hatırlamasına yardımcı olmak için isteğe bağlıdır; makine fotoğrafı her ziyarette zorunlu değildir. Fotoğraf yükleme hedefi: istemci tarafında uzun kenar en fazla 1600 px'e küçültme, JPEG/WebP sıkıştırma ve varsayılan en fazla 2 MB dosya. Çevrimdışıyken fotoğraf bekleyen yükleme kuyruğuna alınır ve yükleme durumu gösterilir. Raf/konum alanı MVP'de isteğe bağlı metindir; ayrıntılı depo yönetimi sonraki sürümdedir.

## 9. Satış, satın alma, ödeme ve borç

### 9.1 Belge durumları ve kesinleştirme

- Satış: DRAFT (taslak; stok/finans etkisi yok), FINAL (kesinleşmiş), CANCELLED (iptal; Bölüm 9.6). Hızlı satış tek adımda FINAL olur; ayrıntılı satış taslak olarak saklanabilir.
- Satın alma: DRAFT, RECEIVED (mal kabulü; stok girişi oluşur), CANCELLED.
- Kesinleşmiş belge doğrudan düzenlenmez; hata varsa iptal (9.6) veya iade (9.7) akışı kullanılır. Düzeltme audit log'a yazılır.
- Payment ve ReturnTransaction durumları POSTED ve REVERSED'dır; hatalı kayıt silinmez, ters kayıtla düzeltilir.

### 9.2 Fiyatlandırma

MVP vergi/KDV hesabını resmî muhasebe yerine işletme içi belge amacıyla destekler. Her belge/kalem için 'KDV dahil', 'KDV hariç' veya 'KDV uygulanmıyor' seçeneği tutulur; varsayılan işletme ayarından, kalem bazında ürün kartındaki varsayılandan gelir. KDV oranı ürün bazında değişebilir; doğru oranlar işletmenin mali müşaviriyle doğrulanır. İşlem anındaki oran ve vergi modu kalemde snapshot olarak saklanır. Resmî fatura üretildiği iddia edilmez.

İndirim satır bazında veya belge genelinde olabilir; indirim negatif tutar olamaz ve belge genelindeki indirimin hangi satırlara dağıtıldığı kayıt altına alınır. Servis belgelerinde de (işçilik ve parça) satır ve belge indirimi desteklenir.

Tüm parasal hesaplar kuruş hassasiyetindedir; yuvarlama satır toplamı seviyesinde 2 ondalık basamakla yapılır. Belge toplamı, yuvarlanmış satır toplamlarının toplamıdır. Reddedilen/ertelenen servis kalemleri, taslak satış kalemleri ve iptal edilmiş kalemler toplam hesaba girmez.

### 9.3 Bakiye bakış açısı ve hesaplama

Tüm bakiyeler işletmenin bakış açısıyla yazılır (Ek A):

- Müşteri bakiyesi pozitifse müşteri işletmeye borçludur (işletmenin alacağı); negatifse işletme müşteriye borçludur (müşteri alacağı: iade bakiyesi, fazla ödeme, avans).
- Tedarikçi bakiyesi pozitifse işletme tedarikçiye borçludur; negatifse tedarikçide işletmenin alacağı vardır (fazla ödeme, iade alacağı).

Hesaplama:

- Müşteri bakiyesi = açılış bakiyesi (OWED\_BY\_PARTY +, OWED\_TO\_PARTY −) + kesinleşmiş satış ve ücretli servis tutarları − müşteriden alınan ödemeler (IN) − iade tutarları + müşteriye yapılan ödemeler/para iadeleri (OUT).
- Tedarikçi bakiyesi = açılış bakiyesi (OWED\_TO\_PARTY +, OWED\_BY\_PARTY −) + RECEIVED satın alma tutarları − tedarikçiye yapılan ödemeler (OUT) − tedarikçi iadeleri + tedarikçiden alınan para iadeleri (IN).

Tek bir genel bakiye alanı doğruluk kaynağı değildir; bakiye her zaman belge, ödeme, iade ve açılış kayıtlarından hesaplanır ve belge bazında açık tutarlara kırılabilir.

### 9.4 Veresiye, ödeme ve tahsis

- Veresiye ödeme yöntemi değil, tahsil edilmemiş alacak durumudur. 'Veresiye' seçimi Payment kaydı yaratmaz; satış bakiyesini açık bırakır. Satışın toplamı, fiilen tahsil edilen ödeme hareketleri ve kalan alacak ayrı tutulur.
- Payment.method yalnızca CASH, CARD, BANK\_TRANSFER, OTHER gibi fiilî ödeme yöntemlerini kabul eder; CREDIT/VERESIYE geçerli tahsilat yöntemi değildir.
- Belgeden alınan ödeme otomatik olarak o belgeye tahsis edilir (PaymentAllocation). Kısmi ödeme bir veya daha fazla gerçek ödeme kaydıyla tutulur.
- Belgesiz genel tahsilat müşteri profilinden alınabilir. Varsayılan tahsis sırası en eski açık kalemden başlar (vade tarihi varsa vade tarihine, yoksa belge tarihine göre; açılış bakiyesi as\_of\_date'ine göre sıralanır). Kullanıcı tahsis önizlemesinde belgeleri elle değiştirebilir.
- Fazla ödeme: belgelere dağıtılamayan kısım müşteri alacağı (avans) olarak kalır ve sonraki borçlara kullanıcı onayıyla mahsup edilir.
- Servis kabulünde alınan kapora, servise bağlı Payment'tır (SR-018); servis kesinleştiğinde servis bakiyesinden düşer.
- Kalan bakiye = belge toplamı − belgeye tahsis edilmiş geçerli ödemeler ± belgelenmiş finansal düzeltmeler. İade ayrı ters kayıtla işlenir.
- Vade tarihi isteğe bağlıdır; girilmezse vade hatırlatması oluşturulmaz. Vade hatırlatması uygulama içi bildirimdir; varsayılan vade gününde ve gecikme 7 günü aşınca bir kez gösterilir.
- Tahsil edilmemiş tutar kalıyorsa müşteri seçimi zorunludur; sahibi olmayan alacak oluşturulamaz (Bölüm 5.3).
- Hatalı ödeme silinmez; ters Payment (REVERSED, reversal\_of\_id) ile düzeltilir.

### 9.5 Satın alma

Hızlı satın alma; tedarikçi, tarih, toplam, ödenen tutar ve kısa açıklamayla yapılabilir. Ayrıntılı satın alma; her ürün/miktar/birim fiyat/indirim satırını içerir; seri takipli ürünlerde seri numaraları da girilebilir. Stok etkisi için hızlı girişte ürün ve miktar satırları zorunludur; yalnız toplam tutarlı hızlı kayıt stok miktarını değiştirmez ve 'stok girişi yapılmadı' uyarısı gösterir. Kayıt RECEIVED olunca stok artar, son alış fiyatı ve satın alma geçmişi güncellenir. Tedarikçi borcu, ödeme hareketleriyle azalır. Satın alma KDV bilgisi yalnızca bilgi amaçlı saklanır; indirilecek KDV hesabı yapılmaz.

### 9.6 Satış iptali (hatalı kayıt)

Hiç gerçekleşmemiş veya hatalı girilmiş kesinleşmiş satış, gerekçe ve onayla iptal edilebilir. İptal; ters stok hareketini (ürün AVAILABLE'a döner, seri birim IN\_STOCK olur), ödemelerin ters kaydını veya müşteriye para iadesini ve makine satışıysa makine-müşteri ilişkisinin geri alınmasını (sahiplik geçmişine yazılır) kapsar. İptal, ürünün müşteriden fiilen geri geldiği iade (9.7) ile karıştırılmaz. İptal edilen satış raporlarda ayrı görünür ve net toplamdan düşer; belge silinmez.

### 9.7 İadeler

| İade türü | İş kuralı |
| --- | --- |
| Müşteri ürün iadesi | Orijinal satış ve satır referansı zorunludur. Tam/kısmi miktar ve tutar sınırlandırılır; daha önce iade edilmiş miktar toplam orijinal miktarı aşamaz. |
| Para iadesi | Nakit/kart/banka iadesi gibi fiilî geri ödeme kaydıyla (Payment OUT) işlenir veya müşteri alacağı olarak bakiyeye yazılır (refund\_method = CUSTOMER\_CREDIT). Kullanıcı iki seçeneği açıkça seçer; aynı tutar hem nakit iade hem müşteri alacağı olarak çift sayılmaz. |
| Ürün durumu | SELLABLE ürün stoğa geri döner; DAMAGED ürün DAMAGED bucket'ına yazılır; NOT\_RETURNED ürün için stok hareketi yapılmaz. |
| Tedarikçiye iade | Orijinal satın alma satırına bağlanır; miktar, tutar, stok çıkışı ve tedarikçi bakiyesi etkisi kaydedilir. |
| Servis iptali/ücret iadesi (teslim öncesi) | Servis iptal edildiğinde (SR-017) alınmış ödeme ve kapora orijinal ödeme kayıtlarına bağlı ters finans hareketiyle iade edilir veya müşteri alacağına yazılır. Kullanılmış parça stoğu otomatik geri eklenmez; fiziksel durum ayrıca değerlendirilir. |
| Servis ücret düzeltmesi (teslim sonrası) | Teslim edilmiş servis iptal edilmez. Ücret düzeltmesi ReturnTransaction (original\_type = SERVICE) ile işlenir; iade edilecek kalemler ve tutar belirtilir, gerekirse parça iadesi stok durumuyla kaydedilir. |
| Düzeltme | İade kaydı silinmez; hatalı iade için ters iade/düzeltme hareketi oluşturulur ve audit log korunur. |

## 10. Açılış verisi ve içe aktarma

MVP'de Excel (.xlsx) ve UTF-8 CSV içe aktarma bulunur. İçe aktarma çevrimiçi yapılır (sunucu doğrulaması gerekir). Şablon dosyaları ve alan eşleştirme ekranı sunulur. İçe aktarma önce önizleme/doğrulama yapar; hatalı satırlar raporlanır ve kullanıcı onayı olmadan kayıtlar uygulanmaz.

- Müşteri listesi: ad, telefon, adres/köy, not.
- Ürün listesi: ad, kod, kategori, birim, satış fiyatı, kritik stok seviyesi, varsayılan KDV.
- Açılış stoğu: ürün, miktar, tarih, açıklama; her satır bir açılış StockMovement kaydı üretir.
- Müşteri ve tedarikçi açılış bakiyesi: taraf, yön (OWED\_BY\_PARTY: taraf işletmeye borçlu; OWED\_TO\_PARTY: işletme tarafa borçlu), tutar, tarih ve açıklama. Bunlar OpeningBalance olarak tutulur, sahte satış/ödeme kaydı yaratılmaz. Açılış bakiyesi değişikliği kritik işlem onayı gerektirir.
- Seri numarası veya telefon gibi alanlarda olası tekrarlar uyarı verir; kullanıcı eşleştirir, birleştirir veya ayrı kayıt oluşturur.
- İçe aktarma batch kimliği, dosya özeti (file\_hash), satır sayısı, başarılı/hatalı satırlar ve tarihçe saklanır. Aynı dosyanın (aynı özet) yanlışlıkla iki kez uygulanmasını önlemek için tekrar yükleme kontrolü yapılır.

## 11. Çevrimdışı çalışma, eşitleme ve cihazlar

### 11.1 Çevrimdışı kapsam

Çevrimdışıyken yapılabilenler: müşteri/makine oluşturma ve düzenleme, yerel arama, QR tarama (kamera ve yerel arama), servis açma/düzenleme, servis durumları ve onaylar, satış, satın alma, iade, stok düzeltme, ürün/tedarikçi oluşturma, ödeme, fotoğraf ekleme (yükleme kuyruğuna), servis fişi/PDF üretme ve temel raporlar için yerel mevcut veriyi okuma.

Çevrimiçi bağlantı gerektirenler: ilk kurulum ve ilk giriş, yeni cihaz ekleme (cihaz kodu atanır), hesap kurtarma ve parola değişimi, cihaz iptali, içe aktarma, tam veri dışa aktarma, yedekten geri yükleme ve sunucu kaydı gerektiren çakışma çözümü. Bu işlemler çevrimdışıyken denendiğinde kullanıcıya açık neden gösterilir.

### 11.2 İlk eşitleme kapsamı

Cihaza varsayılan olarak şunlar indirilir: müşteriler, makineler, ürünler, tedarikçiler, kataloglar, açık servisler, açık bakiyeli belgeler ve son 24 aya ait servis, satış, ödeme ve stok hareketleri. Daha eski kayıtlar çevrimiçiyken sorgulanır; çevrimdışı aramada görünmeyebilir. İlk eşitleme kapsamı, son eşitleme zamanı ve yerel veri kapasitesi kullanıcıya gösterilir.

### 11.3 Eşitleme ilkeleri

- Her kayıt UUID, business\_id, created\_at, updated\_at, device\_id, version ve sync\_state alanlarını taşır. Çakışma kontrolü cihaz saatine değil version/revision alanına dayanır.
- Eşitleme idempotent olmalıdır: aynı işlem yeniden gönderilirse ikinci satış, ödeme veya stok hareketi oluşmaz.
- Bağımlı kayıtlar tutarlı sırayla eşitlenir (müşteri, makine, servis, servis kalemleri, ödemeler gibi; üst kayıt önce).
- Eşitleme hataları veri silmez; kayıt yeniden deneme kuyruğunda kalır ve kullanıcıya hata nedeniyle gösterilir. Başarılı, bekleyen ve başarısız durum görünürdür.
- Stok ve finans hareketleri append-only yaklaşımıyla eşitlenir; sessiz son-yazan-kazan yöntemi finansal hareketlerde kullanılmaz.
- Çakışma: Aynı alanda düşük riskli açıklama/not çakışmaları otomatik birleştirilebilir. Stok, ödeme, sahiplik, iade, seri birim, belge toplamı gibi riskli çakışmalarda kullanıcıya iki sürüm ve önerilen çözüm gösterilir.
- Çevrimdışı stok yalnızca cihazın bildiği son stok ve bekleyen hareketlerle hesaplanır; çoklu cihaz çevrimdışıyken stok rezervasyonu garanti edilmez (ST-003).
- Belge toplamı uyuşmazlığı Bölüm 7.2'ye göre çakışma kuyruğuna alınır.

### 11.4 Cihaz iptali ve kayıp cihaz

- Cihaz hesap ayarından iptal edilebilir (Device.revoked\_at). İptal edilen cihaz bir sonraki bağlantıda yerel verisini siler (wipe\_confirmed\_at yazılır).
- İptal edilmiş cihazdan sonradan gelen bekleyen kayıtlar otomatik uygulanmaz; karantinaya alınır ve kullanıcı onayıyla uygulanır veya reddedilir.
- Cihaz iptali çevrimdışıyken etki etmeyeceğinden, cihaz max\_offline\_days (varsayılan 30 gün) süresini aşarsa yeni kayıt açmadan önce çevrimiçi doğrulama istenir. Mevcut kayıtlar silinmez.

### 11.5 Tarayıcı ve depolama riskleri

iOS ve Android mobil tarayıcılarında kamera ve yerel depolama davranışları değişebilir. Uygulama desteklenen tarayıcı/OS matrisinde test edilir; kalıcı depolama izni istenir ve kritik veriler yalnızca tarayıcı önbelleğine emanet edilmez. Çevrimdışı verinin tarayıcı tarafından temizlenmesi riskine karşı eşitleme durumu, son yedek tarihi ve eşitlenmemiş kayıt sayısı görünür uyarı olarak gösterilir.

## 12. Kimlik doğrulama, güvenlik, KVKK ve yedek

### 12.1 Hesap ve oturum

- Hesap girişi hesap/şifre veya desteklenen güvenli kimlik sağlayıcı ile yapılır; cihaz PIN'i hızlı yeniden giriş için kullanılır. PIN tek başına yeni cihazda hesap kurtarma yöntemi değildir ve başka cihazda eşitleme yetkisi sağlamaz.
- Kurulum sırasında e-posta adresi toplanır ve doğrulanır; hesap kurtarma e-postaya dayanır. E-posta tanımlanmamışsa kullanıcı, hesabını kurtaramama riski konusunda açıkça uyarılır. SMS kurtarma ancak servis sağlayıcı ve maliyet kararı verilirse eklenir.
- Parola politikası modern asgari koşullara uygun olmalıdır; oturum yenileme güvenli standartlara uygun uygulanır; dışa aktarma, geri yükleme, cihaz iptali ve parola değişimi gibi kritik işlemlerde yeniden kimlik doğrulama istenir.
- PIN denemeleri için 5 ardışık başarısız denemede geçici kilit ve artan bekleme uygulanır. Hesap oturumu ve cihaz iptali çevrimiçi yönetilebilir.
- Yerel veri için platformun güvenli depolama mekanizması ve mümkün olan yerde şifreleme kullanılır; kimlik bilgileri ve hassas anahtarlar düz metin saklanmaz.

### 12.2 Yetkilendirme ve veri sahipliği

- İşletme verileri business\_id ile ayrılır; sunucu tarafında her istekte işletme erişimi doğrulanır. Tahmin edilebilir ID tek başına erişim sağlamaz.
- QR kodu ile açılan kayıt da oturum ve izin kontrolünden geçer; QR kodunu okutan kişi oturum açmamışsa giriş ekranı gösterilir, kayıt bilgisi ifşa edilmez.
- Veri dışa aktarma, geri yükleme, hesap kapatma ve kalıcı silme gibi kritik işlemler kimliği doğrulanmış kullanıcı tarafından başlatılır. Dışa aktarma dosyası oluşturulurken hassas veri içerdiği hatırlatılır; dosyalar yalnızca kullanıcının bilinçli işlemiyle oluşturulur.
- Geliştiriciye ait teknik yönetim erişimi gerekiyorsa en az yetki, kayıt altına alma ve gizlilik ilkeleri uygulanır.

### 12.3 Yedekleme

- Günlük otomatik yedekleme hedeflenir. İş tarafı hedefi: eşitlenmiş veride RPO en fazla 24 saat; RTO hedefi 1 iş günü. Bu hedefler gerçek yedekleme/geri yükleme testiyle doğrulanır.
- Eşitleme ile yedekleme birbirinin yerine geçmez. Son başarılı yedekleme zamanı ve hata durumu izlenebilir olmalıdır. Yedekler yetkisiz erişime karşı korunur, mümkünse aktarımda ve depolamada şifrelenir.
- Geri yükleme öncesi mevcut veri için ek yedek alınır, hedef veri kümesi ve üzerine yazma etkisi açıklanır ve kullanıcıdan kritik onay istenir. Geri yükleme audit log'a yazılır. Yedekten geri yükleme MVP tesliminden önce test edilir.

### 12.4 KVKK ve gizlilik

- İş için gerekli olmayan müşteri verileri toplanmaz (ör. T.C. kimlik numarası).
- Canlıya çıkmadan önce aydınlatma metni, işleme amacı/hukuki sebep, saklama süresi, veri sahibi başvuru süreci, fotoğraf kullanımı, hizmet sağlayıcının veri lokasyonu ve aktarım koşulları hukuk danışmanıyla kontrol edilmelidir. Bu PRD hukuki görüş yerine geçmez.
- Müşteri fotoğrafı kişisel veri olarak ele alınır; isteğe bağlıdır, erişimi kısıtlanır ve silme/saklama politikasına tabidir. Arşivleme ile kalıcı silme/anonimleştirme ayrıdır (Bölüm 7.5).
- Hata günlükleri gereksiz kişisel veri içermemelidir.

## 13. Bildirimler

| Bildirim | Tetikleyici / çözülme |
| --- | --- |
| Müşteri onayı bekleniyor | Servis bu duruma geçtiğinde bir kez açılır; müşteri kararı kaydedilince çözülür. |
| Parça bekleniyor | Servis parça bekleniyor durumuna geçtiğinde açılır; tüm parçalar ARRIVED/IN\_STOCK olarak kaydedilince çözülür. |
| Teslim tarihi hatırlatma | Varsayılan 1 gün önce; tarih geçerse teslim edilene kadar günde bir kez. |
| Servis tamamlandı | İş tamamlandı durumuna ilk geçişte oluşturulur; tekrar açılırsa eski bildirim geçmişte kalır. |
| Kritik stok | AVAILABLE stok kritik seviyeye eşit/altına indiğinde; eşik üstüne çıkınca çözülür, tekrar altına indiğinde yeni bildirim. |
| Vade hatırlatma | Vade tarihi girilmiş ve bakiye açık ise vade gününde, gecikme 7 günü aşınca bir kez daha. |
| Eşitleme sorunu | Eşitlenemeyen kayıt veya çakışma kuyruğunda bekleyen madde varsa; çözülünce kapanır. |

MVP bildirimleri uygulama içindedir. Okundu/çözüldü bilgisi sunucuya eşitlenir; çevrimdışı okundu bilgisi bağlantı gelince eşitlenir. Aynı olay için cihaz başına tekrarlı bildirim üretilmemesi dedupe\_key ile sağlanır. Telefon anlık bildirimi ve otomatik WhatsApp gönderimi sonraki sürümdedir.

## 14. QR, fiş ve yazdırma

- Makine QR kodu yalnızca değişmeyen benzersiz kayıt kimliği/URL taşır; fiyat veya stok gibi değişken veri QR içine gömülmez. Erişim oturum/izin kontrolünden geçer (Bölüm 12.2).
- Makine QR ekranı: makine özeti, sahibi, geçmiş servisler ve yeni servis başlat eylemi.
- Ürün QR ekranı: ürün adı/kodu, mevcut stok, satış fiyatı ve son alış fiyatı.
- Etiket ölçüsü yazdırma ayarından seçilebilir; QR ve kısa kimlik/ürün adı gösterilir, isteğe bağlı işletme adı eklenebilir. Raf etiketi boyutu ve etiket yazıcısı desteği cihaz bazında test edilir.
- Servis kabul fişi: işletme adı/telefonu/logosu, servis no/tarih, müşteri, makine, teslim alınan aksesuarlar, mevcut hasar, müşteri şikâyeti ve teslim koşulları (ayarlardan düzenlenen alt metin).
- Servis sonuç özeti: işletme adı/telefonu, servis no/tarih, müşteri/makine/seri veya iç numara, şikâyet ve yapılan iş özeti, toplam, tahsil edilen, kalan bakiye, durum ve teslim bilgisi. Dahili parça maliyetleri ve işletme içi maliyet detayları müşteri çıktısında varsayılan olarak gösterilmez.
- Kâğıt biçimi ayarlanabilir (A4 ve dar fiş/etiket biçimi hedeflenir); telefon ve bilgisayardan standart yazıcıya yazdırma ile PDF kaydetme alternatifi vardır. Desteklenen biçimler hedef yazıcılarla test edilir.
- Çıktılar resmî fatura olarak adlandırılmaz; resmî fatura değildir.

## 15. Raporlar

| Rapor | Tanım |
| --- | --- |
| Günlük/aylık satış | Satış belgelerinin belge tarihine göre brüt, indirim, iade, iptal ve net satış toplamları. Tutarlar KDV dahil brüt tutardır; vergi tutarı ayrı sütunda gösterilir. |
| Tahsilat | Fiilî ödeme hareketlerinin ödeme tarihine göre nakit/kart/banka/diğer ayrımı. Veresiye satış dahil edilmez. |
| Servis geliri | Tamamlanan (first\_completed\_at) ücretli servis kalemlerinin tahakkuk eden tutarı; tamamlanma tarihine göre ve tahsilattan ayrı gösterilir. Yeniden açılan servis ikinci kez sayılmaz. İptal/iade düzeltmeleri ve iptalde alınan inceleme ücreti ilgili raporda yer alır. |
| Aktif servisler | Duruma, bekleme sebebine, vaat edilen teslim tarihine göre liste. |
| Müşteri bakiyeleri | Müşteri bazında bakiye (Bölüm 9.3) ve hareket dökümü. Yaşlandırma bantları 0–7, 8–30, 31–60, 60+ gün; yalnızca müşteri borcu olan (pozitif) açık kalemler için belge (varsa vade) tarihine göre hesaplanır. Müşteri alacakları ayrı gösterilir. |
| Tedarikçi bakiyeleri | Tedarikçi borcu, yapılan ödemeler, iadeler ve kalan borç. |
| Stok ve hareketler | Anlık satılabilir ve hasarlı stok, kritik seviye, ürün bazlı giriş/çıkış ve hareket kaynağı. |
| Makine geçmişi | Makineye bağlı tamamlanmış servisler, tarih, işlem ve servis sayısı. |

Tarih filtreleri yerel Türkiye tarihine göre başlangıç ve bitiş günlerini kapsar. Satış tarihi ile tahsilat tarihi farklı raporlanır. İade/iptal orijinal belgeyi silmez; ilgili net rapordan ters kayıt olarak düşer. Geçmiş fiyatlar raporlarda işlem anındaki değerleriyle korunur. Dışa aktarma MVP'de XLSX ve UTF-8 CSV olarak sunulur; CSV için Türkçe karakter ve Excel ayraç uyumluluğu test edilir. Kasa kapatma ve ileri düzey kârlılık analizi MVP'de bulunmaz.

## 16. Fonksiyonel gereksinimler

| ID | Gereksinim |
| --- | --- |
| FR-001 | Kullanıcı güvenli hesapla giriş yapabilmeli, cihaz PIN'i belirleyebilmeli ve hesap kurtarma akışını başlatabilmelidir. |
| FR-002 | İlk kurulum sihirbazı işletme adı, telefon, adres, e-posta (kurtarma için), para birimi ve vergi varsayılanını toplamalıdır. Cihaz kodu kullanıcıdan istenmez, sunucu tarafından otomatik atanır; ilk kurulum çevrimiçi yapılır. |
| FR-003 | Müşteri oluşturma, arama, düzenleme, arşivleme ve isteğe bağlı fotoğraf desteklenmeli; normalize edilmiş telefonla mükerrer müşteri önerilmelidir. |
| FR-004 | Makine oluşturma, müşteriyle ilişkilendirme, seri/iç numara, garanti ve servis geçmişi desteklenmeli; aynı marka-seri mükerrerliği uyarılmalı; geçici makine kaydı dönüştürülebilmeli veya birleştirilebilmelidir. |
| FR-005 | Makine sahipliği değişikliği geçmiş kaydı oluşturmalıdır. |
| FR-006 | QR ile makine/ürün kaydı açılabilmeli; makine ekranından yeni servis başlatılabilmelidir. |
| FR-007 | Servis emri şikâyet, teşhis, işlemler, parça satırları, onaylar ve teslim bilgilerini ayrı tutmalıdır. |
| FR-008 | Servis durum geçişleri doğrulanmalı ve geçmişleri saklanmalıdır. |
| FR-009 | Servis şablonları ve servis emrine kopyalanan kontrol listesi maddeleri desteklenmelidir. |
| FR-010 | Servis kabul fişi ve sonuç özeti yazdırılabilmeli/PDF üretilebilmelidir. |
| FR-011 | Ürün, arıza ve işlem katalogları ekleme, düzenleme ve pasifleştirme desteklemelidir. |
| FR-012 | Ondalıklı birimli stok, kritik stok seviyesi, hasarlı stok ve stok hareket defteri desteklenmelidir. |
| FR-013 | Negatif stok varsayılan olarak engellenmeli; çevrimdışı eşitleme çakışması görünür olmalıdır. |
| FR-014 | Hızlı satış ve ayrıntılı satış; ürün ve seri takipli makine satışı desteklenmelidir. |
| FR-015 | Hızlı ve detaylı satın alma, tedarikçi ve tedarikçi borçları desteklenmelidir. |
| FR-016 | Açılış müşteri/ürün/stok/bakiye içe aktarma ve doğrulama ekranı bulunmalıdır. |
| FR-017 | Ödeme, kısmi tahsilat, veresiye bakiyesi, vade, kapora, fazla ödeme ve ödeme tahsisi birbirinden ayrılmalıdır. |
| FR-018 | Müşteri ürünü, tedarikçi ürünü ve servis ücret iadesi/düzeltmesi kısmi/tam olarak desteklenmelidir. |
| FR-019 | İade, satış/servis iptali, stok düzeltme ve finansal düzeltmeler orijinal kayda bağlı ters kayıtlarla tutulmalıdır. |
| FR-020 | Çevrimdışı kayıtlar UUID ile oluşturulmalı, idempotent biçimde eşitlenmelidir. |
| FR-021 | Çakışmalar risk seviyesine göre otomatik çözülebilmeli veya kullanıcıya sunulmalıdır. |
| FR-022 | Uygulama içi bildirimler ve okundu/çözüldü bilgisi cihazlar arasında eşitlenmelidir. |
| FR-023 | Günlük yedekleme, geri yükleme, audit log ve cihaz oturumu iptali desteklenmelidir. |
| FR-024 | Global arama çevrimdışı mevcut kayıtları aramalı, kapsam sınırlamasını göstermeli ve arşivde arama seçeneği sunmalıdır. |
| FR-025 | Temel satış, tahsilat, servis, stok ve taraf bakiyesi raporları bulunmalıdır. |
| FR-026 | XLSX ve UTF-8 CSV içe/dışa aktarma desteklenmelidir. |
| FR-027 | Tüm işletme kayıtları business\_id ile kapsamlanmalı ve sunucu erişim kontrolünden geçmelidir. |
| FR-028 | Fotoğraf boyut küçültme, sıkıştırma ve çevrimdışı yükleme kuyruğu bulunmalıdır. |
| FR-029 | Makine satışı ilgili Machine kaydını oluşturmalı/bağlamalı, seri numaralı stok birimini doğru düşmelidir. |
| FR-030 | Fiyat, indirim, vergi modu ve yuvarlama kuralı her belgede (satış ve servis) paylaşılan hesaplama modülüyle tutarlı hesaplanmalıdır. |
| FR-031 | Seri takipli ürünler için ProductSerialUnit kayıtları satın alma, satış, iade ve stok akışlarında yönetilmelidir. |
| FR-032 | Onay eşiği ayarlanabilmeli; eşiği aşan veya artan tutarlı servis işlerinde onay zorunlu olmalıdır. |
| FR-033 | Arşivleme kuralları (açık servis/bakiye engeli, geri alma, arşivde arama) uygulanmalıdır. |
| FR-034 | Temel ve gelişmiş ayarlar ile yardım ekranları bulunmalıdır. |
| FR-035 | Eşitleme, yedek ve bildirim durumunu tek yerde gösteren merkez ekranı bulunmalıdır. |
| FR-036 | Stok çıkışı yapan satış, servis ve hareket satırlarında maliyet snapshot'ı toplanmalıdır. |
| FR-037 | Satış ve servis iptali gerekçe ve onayla, ters hareketlerle yapılmalıdır. |

## 17. Fonksiyonel olmayan gereksinimler

| ID | Gereksinim |
| --- | --- |
| NFR-001 | Mobil öncelikli arayüz; yaygın mobil ekranlarda temel akışlar yatay kaydırma gerektirmemeli ve en sık işlemler tek elle kullanılabilmelidir. |
| NFR-002 | Yeni servis açılışı mevcut müşteri/makine için normal koşullarda yaklaşık 30 saniye, yeni müşteri/makineyle yaklaşık 90 saniye hedeflemelidir. |
| NFR-003 | Çevrimiçi normal arama ve kart açılışı tipik kullanımda 2 saniye hedeflemelidir (başlangıç hedefi p95 < 2,5 sn); büyük veri hacminde ölçüm yapılır. |
| NFR-004 | Eşitleme tekrar çalıştırıldığında finansal/stok hareketi kopyası yaratmamalıdır. |
| NFR-005 | İşletme verileri tenant/business izolasyonuyla korunmalıdır. |
| NFR-006 | Yedekten geri yükleme düzenli test edilmelidir; hedef RPO ≤24 saat, RTO ≤1 iş günü. |
| NFR-007 | Türkçe karakterler, Türkiye saat dilimi (UTC saklama) ve TL/kuruş hassasiyeti (decimal) uçtan uca korunmalıdır. |
| NFR-008 | iOS ve Android için desteklenen tarayıcı/OS matrisi yayınlanmalı ve kamera/QR/çevrimdışı depolama test edilmelidir. Güncel Chrome/Edge ve yaygın mobil tarayıcılar hedeflenir. |
| NFR-009 | Hassas veri aktarımda TLS ile şifrelenmeli; yerel depolama için platform güvenli depolaması kullanılmalıdır. |
| NFR-010 | Uygulama içi kritik hatalar kullanıcıya anlaşılır Türkçe mesaj ve kurtarma adımı göstermelidir. |
| NFR-011 | Her finans/stok düzeltmesi izlenebilir aktör, cihaz, tarih ve neden bilgisi taşımalıdır. |
| NFR-012 | Günlük yedekleme ve geri yükleme testleri operasyonel kontrol listesine eklenmelidir. |
| NFR-013 | Erişilebilirlik: yeterli kontrast, dış mekânda okunabilir yazı boyutu, dokunma hedefleri, klavye erişimi ve form hata açıklamaları sağlanmalıdır. |
| NFR-014 | İzlenebilirlik: kritik hatalar, eşitleme ve yedekleme başarısızlıkları teşhis edilebilir olmalı; günlükler gereksiz kişisel veri içermemelidir. |
| NFR-015 | Bakım yapılabilirlik: iş mantığı, veri erişimi ve arayüz ayrıştırılmalı; hesaplama ve eşitleme kuralları birim testlerle korunmalıdır. |

## 18. Kabul kriterleri

| ID | Kabul kriteri |
| --- | --- |
| AC-001 | Yeni servis mevcut müşteri ve makine seçilerek şikâyetle açılır; servis UUID'si ve belge numarası oluşur. |
| AC-002 | Yeni müşteri ve yeni makineyle servis açılışı temel alanlarla tamamlanabilir; zorunlu olmayan fotoğraf/seri no kaydı engellemez. |
| AC-003 | Makine QR okutulunca doğru makine, sahibi ve servis geçmişi açılır; yeni servis eylemi çalışır. Oturum açık değilse önce giriş istenir. |
| AC-004 | Onaylanmayan servis kalemi toplam tutara girmez; fiyat yükseldiğinde eski onay yeni tutarı kapsamaz. |
| AC-005 | Şablon uygulandığında kontrol listesi maddeleri servis emrine kopyalanır; şablon değişikliği açık servis kopyasını değiştirmez. |
| AC-006 | Ürün kartı olmayan müşteri parçası ServicePart olarak kaydedilir ve stok hareketi üretmez. |
| AC-007 | Stok ürünü fiilen kullanıldığında ürün, miktar, birim fiyat snapshot'ı, maliyet snapshot'ı ve stok hareketi kaydedilir. |
| AC-008 | Stok sıfırken satış/servis tüketimi varsayılan olarak engellenir; istisna ayarı açıksa onay ve gerekçe gerekir. |
| AC-009 | İki cihaz çevrimdışı aynı son stoğu tükettiğinde eşitleme hareketleri silmez; çakışma uyarısı ve çözüm akışı sunar. |
| AC-010 | Veresiye tutarı tahsilat raporuna girmez; kalan müşteri bakiyesi doğru hesaplanır. |
| AC-011 | Kısmi ödeme sonrası belge toplamı, tahsil edilen ve kalan bakiye ayrı ve doğru görünür (örn. 2.000 ₺ işlemde 1.000 ₺ nakit ve 500 ₺ kart tahsilatı sonrası kalan 500 ₺). |
| AC-012 | Müşteri ürünü iadesinde kısmi miktar, para iadesi/müşteri alacağı seçimi ve stoğa dönüş durumu ayrı kaydedilir. |
| AC-013 | Tedarikçiye iade orijinal satın alma satırına bağlanır; stok ve tedarikçi bakiyesi doğru güncellenir. |
| AC-014 | Servis iptali/ücret iadesi geçmiş ödemeyi silmez; ters finans hareketi üretir. |
| AC-015 | Açılış stoku ve müşteri/tedarikçi bakiyeleri içe aktarıldığında açılış hareketleri/OpeningBalance kayıtları oluşur; aynı batch ikinci kez uygulanmaz. |
| AC-016 | İki cihaz çevrimdışı kayıt oluşturduğunda UUID ve cihaz kodlu belge numarası çakışmaz; eşitleme sonrası numara çakışması olursa eski numara denetim geçmişinde kalır. |
| AC-017 | Servis durum değişiklikleri geçmişe yazılır; yeniden açılan servis servis sayacını ikinci kez artırmaz. |
| AC-018 | Makine sahipliği değiştiğinde önceki/yeni müşteri ve değişiklik tarihi geçmişte saklanır. |
| AC-019 | Başka business\_id kapsamındaki kayıt yetkisiz istekle okunamaz/değiştirilemez. |
| AC-020 | PIN 5 hatalı denemeden sonra geçici kilit uygular; hesap kurtarma akışı başlatılabilir. |
| AC-021 | Fotoğraf 2 MB hedef limitine göre sıkıştırılır; çevrimdışı yükleme kuyruğu bağlantı gelince devam eder. |
| AC-022 | Çevrimdışı arama yerel kayıtları bulur ve indirilmeyen kayıtların görünmeyebileceğini belirtir. |
| AC-023 | Raporlar satış tarihi, tahsilat tarihi ve servis tahakkukunu ayrı hesaplar; iade/iptal net toplamı düzeltir. |
| AC-024 | XLSX ve UTF-8 CSV dışa aktarımında Türkçe karakterler ve tarih/tutar biçimleri korunur. |
| AC-025 | Borçlu servis tesliminde kalan bakiye kullanıcıya gösterilir ve teslim kaydı oluşur. |
| AC-026 | KDV modu, indirim ve 2 ondalıklı yuvarlama ile belge toplamı ortak hesaplama modülüyle doğrulanır; istemci ve sunucu sonucu farklıysa belge çakışma kuyruğuna düşer, sessizce değişmez. |
| AC-027 | Makine satışı stoktaki doğru seri numaralı birimi düşer ve Machine kaydını müşteriyle ilişkilendirir. |
| AC-028 | Kritik stok bildirimi eşik altına ilk düşüşte oluşur; çözülmeden yinelenmez; stok tekrar düşerse yeni bildirim oluşur. |
| AC-029 | Aynı normalize telefonla müşteri açılırken mevcut kayıt önerilir; kullanıcı bilinçli olarak yeni kayıt oluşturabilir. Aynı marka ve seri numaralı makine için uyarı verilir. |
| AC-030 | Arşivlenen kayıt standart listeden ve varsayılan aramadan kalkar, 'arşivde de ara' ile bulunur; geçmiş ve ilişkili finans/stok kayıtları bozulmaz. Açık servisi veya sıfır olmayan bakiyesi olan müşteri arşivlenemez. |
| AC-031 | Stok düzeltmede önceki miktar, yeni miktar, fark, neden, tarih ve kullanıcı/cihaz geçmişte görüntülenir; neden olmadan düzeltme kaydedilemez. |
| AC-032 | Kritik bir kayıt düzeltildiğinde eski/yeni değer, tarih, aktör ve gerekçe görüntülenebilir. |
| AC-033 | İptal edilen servis sayacı artırmaz; tamamlanıp sonradan iptal edilen servis sayaçtan düşer; teslim edilmiş servis iptal edilemez, ücret düzeltmesi iade akışıyla yapılır. |
| AC-034 | Servis fişi gerekli alanları içerir; dahili maliyetler ve maliyet snapshot'ı müşteri çıktısında görünmez. |
| AC-035 | Ürün QR taraması doğru ürünü açar; fiyat/stok değişikliği QR yeniden basılmadan görünür. |
| AC-036 | Aynı eşitleme paketi tekrar gönderildiğinde sunucuda ikinci kayıt oluşmaz. |
| AC-037 | Eşitleme hatasında kayıt silinmez, yeniden deneme kuyruğunda kalır ve kullanıcı hatayı görür. |
| AC-038 | Onay bekleyen servis, teslim hatırlatması ve vade hatırlatması ana ekranda/bildirimlerde görünür; çözülmeden tekrarlanmaz. |
| AC-039 | Seri takipli ürünün her birimi ayrı kayıtlıdır; aynı birim iki kez satılamaz; çevrimdışı çift satış eşitlemede çakışma kuyruğuna düşer. |
| AC-040 | Belgesiz genel tahsilat varsayılan olarak en eski açık kalemden tahsis edilir, kullanıcı önizlemede değiştirebilir; belgelere dağıtılamayan tutar müşteri alacağı olarak kalır. |
| AC-041 | Müşteri seçilmeden kalan alacak oluşturan satış tamamlanamaz. |
| AC-042 | Onay eşiğini aşan servis, onay kaydı olmadan 'İşlemde' durumuna geçemez; ek iş/fiyat artışı servisi 'Müşteri onayı bekleniyor' durumuna alır. |
| AC-043 | DAMAGED iade edilen ürün satılabilir stoğa girmez, hasarlı stok miktarını artırır ve kritik stok hesabına dahil edilmez. |
| AC-044 | Satış iptali ters stok ve ters ödeme hareketleri üretir, iade ile karışmaz ve raporlarda ayrı görünür. |
| AC-045 | İptal edilen cihaz bağlandığında yerel verisini siler; iptalden sonra gelen bekleyen kayıtlar karantinaya alınır. |
| AC-046 | İade müşteri alacağı olarak yazıldığında müşteri bakiyesi negatif görünür; yaşlandırma bantları yalnızca müşteri borcu olan kalemleri içerir. |
| AC-047 | Aynı dosya özetine sahip içe aktarma ikinci kez uygulanmaz. |
| AC-048 | Hesap kurtarma e-postayla başlatılabilir; kurulumda e-posta girilmediyse kullanıcı uyarılır. |
| AC-049 | Dışa aktarma kimlik doğrulaması ister ve hassas veri uyarısı gösterir. |
| AC-050 | Stok çıkışı yapan işlemlerde unit\_cost\_snapshot kaydedilir ve sonraki alış fiyatı değişse de değişmez. |
| AC-051 | Geçici makine kaydı gerçek makineye dönüştürülebilir veya mevcut makineyle birleştirilir; servisler taşınır ve işlem audit log'a yazılır. |

## 19. Test senaryoları

| ID | Senaryo | Beklenen sonuç |
| --- | --- | --- |
| TC-001 | Mevcut müşteri ve makineyle servis açma | Servis oluşur; şikâyet ve zaman kaydı vardır. |
| TC-002 | Yeni müşteri + yeni makine + servis | Tek akışta kayıtlar bağlanır; zorunlu alanlar dışındakiler atlanabilir. |
| TC-003 | QR ile makine bulma | Doğru makine/servis geçmişi açılır; oturum yoksa giriş istenir. |
| TC-004 | İki işlemden biri reddedilir | Reddedilen işlem toplam ve stok tüketimine girmez. |
| TC-005 | Teklif fiyatı onaydan sonra artar | Yeni onay olmadan artan tutarlı işe devam engellenir. |
| TC-006 | Serviste ürün kartlı parça kullanımı | ServicePart ve tek stok çıkış hareketi oluşur; teklif aşamasında stok değişmez. |
| TC-007 | Müşterinin getirdiği parça | Parça bilgisi saklanır; stok değişmez. |
| TC-008 | Şablon uygulanması ve şablonun sonradan düzenlenmesi | Açık servis checklist kopyası sabit kalır. |
| TC-009 | Garanti kapsamında ücretsiz iş | Ücret 0 görünür; garanti işareti ve kullanılan parça hareketi korunur. |
| TC-010 | Servisi tamamla, borçlu teslim et, sonra tahsilat al | Teslim durumu korunur; bakiye ödeme gelince azalır. |
| TC-011 | Sıfır stokta satış | Varsayılan engel ve açıklayıcı mesaj gösterilir. |
| TC-012 | İki cihazda çevrimdışı son ürünü tüketme | Eşitlemede çatışma oluşturulur, hareketler kaybolmaz. |
| TC-013 | Ondalıklı misina/litre satışı | Birim hassasiyeti ve toplam doğru hesaplanır. |
| TC-014 | Kısmi ürün iadesi | İade miktarı orijinal satırı aşmaz; stok disposition uygulanır. |
| TC-015 | Tedarikçi iadesi | Satın alma, stok ve tedarikçi bakiyesi tutarlı güncellenir. |
| TC-016 | Servis ücret iadesi | Orijinal ödeme silinmeden ters finans hareketi oluşur. |
| TC-017 | Açılış stoğu ve bakiye içe aktarma | Önizleme, doğrulama ve çift import koruması çalışır. |
| TC-018 | İki cihaz çevrimdışı belge üretir | UUID benzersiz; numara çakışması olursa audit log ve yeniden numaralama çalışır. |
| TC-019 | Servis durum geçişleri ve yeniden açma | Geçersiz geçiş engellenir; geçmiş ve servis sayacı tutarlı kalır. |
| TC-020 | Makine sahipliği değişimi | Önceki sahiplik geçmişi korunur. |
| TC-021 | Business izolasyonu | Başka işletmenin kayıtlarına erişim reddedilir. |
| TC-022 | PIN deneme sınırı ve hesap kurtarma | Kilit ve kurtarma akışı çalışır. |
| TC-023 | Çevrimdışı arama | Yerel kayıtlar bulunur; eşitlenmemiş veri durumu görünür. |
| TC-024 | Fotoğrafı çevrimdışı ekle | Fotoğraf kuyruğa girer, bağlantı gelince yüklenir. |
| TC-025 | Satış, tahsilat ve servis geliri raporları | Her rapor doğru tarih ve tanıma göre hesaplanır. |
| TC-026 | CSV Türkçe karakter dışa aktarımı | Türkçe karakterler Excel'de bozulmadan açılır. |
| TC-027 | KDV/indirim/yuvarlama sınır değerleri | Satır ve belge toplamları 2 ondalık kurala uyar. |
| TC-028 | Seri numaralı makine satışı | Doğru stok birimi düşer; müşteri/makine bağı doğru kurulur. |
| TC-029 | Kritik stok bildirimi | Eşik altına düşüşte bildirim, stok toparlanınca çözülme olur. |
| TC-030 | Günlük yedekten geri yükleme | RPO/RTO hedefi ölçülür; geri yükleme audit log'a yazılır. |
| TC-031 | Aynı telefonla müşteri açma (0532..., +90 532... biçimleri) | Mevcut kayıt önerilir; yeni kayıt bilinçli seçilebilir. |
| TC-032 | Müşteri/makine arşivleme | Açık servis/bakiye varsa engellenir; yoksa listeden gizlenir, geçmiş ve raporlar bozulmaz, arşivde aranınca bulunur. |
| TC-033 | Stoğu 10'dan 7'ye düzeltme | Miktar 7 olur; -3 fark, neden ve onay geçmişte bulunur. |
| TC-034 | Servis iptali ve sayaç | İptal sayaç artırmaz; tamamlanmış servis iptalinde sayaç düşer; teslim edilmiş servis iptal edilemez. |
| TC-035 | Servis fişi içeriği | Gerekli alanlar görünür; iç maliyet ve maliyet snapshot'ı görünmez. |
| TC-036 | Ürün QR'ı ve fiyat değişimi | Aynı QR güncel fiyatı gösterir. |
| TC-037 | Aynı eşitleme paketini birden fazla gönderme | Sunucuda yalnızca bir kayıt oluşur. |
| TC-038 | Eşitleme sırasında hata ve yeniden deneme | Kayıt silinmez, kuyrukta kalır, yeniden denemede bir kez oluşur. |
| TC-039 | Onay, teslim ve vade bildirimleri | Doğru zamanda görünür, çözülmeden tekrarlanmaz. |
| TC-040 | İki cihazda çevrimdışı aynı seri birimi satma | Çakışma kuyruğu oluşur; birim iki kez satılmaz. |
| TC-041 | Belgesiz genel tahsilat ve fazla ödeme | En eski kalemden tahsis edilir; fazla tutar müşteri alacağı olarak kalır. |
| TC-042 | Müşteri seçmeden veresiye satış deneme | İşlem engellenir; müşteri seçimi/yeni müşteri istenir. |
| TC-043 | Onay eşiği ve ek iş | Eşik üstü servis onaysız ilerlemez; ek iş durumu 'Müşteri onayı bekleniyor'a alır. |
| TC-044 | Hasarlı ürün iadesi | DAMAGED stoğa yazılır; satılabilir stok ve kritik stok etkilenmez. |
| TC-045 | Hatalı satış iptali | Ters stok/ödeme oluşur; raporlarda iptal olarak ayrı görünür. |
| TC-046 | Cihaz iptali | İptal edilen cihaz bağlanınca yerel veri silinir; sonradan gelen bekleyen kayıtlar karantinaya alınır. |
| TC-047 | İade bakiyesi ve yaşlandırma | Müşteri alacağı negatif görünür; yaşlandırma yalnızca borç kalemlerini bantlar. |
| TC-048 | Aynı dosyayı iki kez içe aktarma | İkinci uygulama engellenir. |
| TC-049 | Hesap kurtarma ve kurulumda e-posta yokluğu | Kurtarma e-postayla çalışır; e-postasız kurulumda uyarı gösterilir. |
| TC-050 | Dışa aktarma güvenliği | Kimlik doğrulama ve hassas veri uyarısı çıkar. |
| TC-051 | Çevrimdışı hesaplanan toplam sunucuyla farklı çıkar | Belge çakışma kuyruğuna düşer; iki tutar gösterilir, sessiz değişiklik olmaz. |
| TC-052 | Geçici makine kaydı birleştirme | Servisler hedef makineye taşınır, geçici kayıt arşivlenir, audit log yazılır. |
| TC-053 | Çevrimdışı satın alma ve iade eşitleme | Stok ve bakiyeler eşitleme sonrası tutarlıdır, kopya oluşmaz. |
| TC-054 | Stok bakiyesini hareketlerden yeniden hesaplama | Hesaplanan değer Product alanlarıyla eşleşir; fark varsa audit log'a yazılır. |
| TC-055 | İşlemdeyken ek iş çıkması | Servis 'Müşteri onayı bekleniyor' durumuna geçer; onaysız ek iş yapılamaz. |
| TC-056 | Kapora ile servis kabulü ve iptal | Kapora servis ödemesi olarak görünür; iptalde iade edilir veya müşteri alacağına yazılır. |

## 20. Öncelikli uygulama sırası

| Faz | Kapsam |
| --- | --- |
| Faz 1 — Temel omurga | Business/User/Device, giriş/PIN/kurtarma, müşteri-makine (mükerrer uyarısı), UUID, version alanı, eşitleme altyapısı (idempotency, append-only, hata kuyruğu, çakışma kuyruğu iskeleti), audit log, ortak hesaplama modülü iskeleti, günlük yedek, global arama. |
| Faz 2 — Stok ve ödeme çekirdeği | Ürün kataloğu, stok hareketi, hasarlı stok, negatif stok kuralı, Payment, PaymentAllocation ve bakiye hesabı (servis ve satış bu çekirdeği kullanır). |
| Faz 3 — Servis | Servis emirleri, durum geçmişi, onay eşiği, ServicePart, checklist, garanti işareti, kapora, kabul/sonuç fişi (tahsilat/bakiye gösterir), QR makine etiketi. |
| Faz 4 — Ticaret | Hızlı satış, seri takipli makine satışı (ProductSerialUnit), satın alma, tedarikçi, satış durumları. |
| Faz 5 — Finans ve iade | Veresiye bakiyesi, vade, açılış bakiyeleri, iade, satış/servis iptali, ters kayıtlar. |
| Faz 6 — İçe/dışa aktarma ve rapor | XLSX/CSV import/export, açılış stoğu/bakiyesi, rapor tanımları, bildirimler. |
| Faz 7 — Sağlamlaştırma | iOS/Android tarayıcı testi, güvenlik testi, yedekten geri yükleme provası, çakışma ve çok cihazlı eşitleme testleri, kullanılabilirlik iyileştirmeleri, kullanıcı kabul testi. |

Eşitleme ilkeleri (idempotency, append-only, version, çakışma kuyruğu) Faz 1'de kurulur ve sonraki fazlardaki her yeni varlık bunlara uyar; çakışma ve çok cihaz testleri Faz 7'ye bırakılmaz, her fazın kabulünde o fazın varlıkları için koşulur. Faz sırası teknik ekip tarafından bağımlılıklara göre paralelleştirilebilir; ancak finans ve stok akışları test edilmeden canlı kullanım için hazır kabul edilmez.

## 21. Geliştiriciye açıkça bırakılan teknik seçimler

- Teknoloji yığını, veritabanı ve barındırma sağlayıcısı; veri lokasyonu ve KVKK etkisi değerlendirilerek seçilir.
- Kimlik doğrulama sağlayıcısı ve e-posta gönderim altyapısı.
- Yerel veritabanı/şifreli depolama uygulaması, kalıcı depolama izni ve PWA destek matrisi.
- Eşitleme algoritması ve çakışma çözümü arayüzü; paylaşılan hesaplama modülünün istemci/sunucu paylaşım yöntemi.
- Sunucu yedekleme sağlayıcısı ve gerçek geri yükleme prosedürü.
- Etiket/fiş yazıcıları ve tarayıcı bazlı yazdırma uyumluluğu.
- PDF/XLSX/CSV oluşturma yöntemi ve Türkçe karakter desteği.

Yukarıdaki teknik seçimler değişse de iş kuralları, benzersiz UUID, business\_id izolasyonu, audit log, finans/stok ters kayıt ilkeleri, decimal para tipi ve UTC saklama korunmalıdır.

## 22. Canlıya çıkış kontrol listesi

- [ ] Business/User/Device izolasyonu ve yetkisiz erişim testleri geçti.
- [ ] Müşteri/makine kayıtları, mükerrer uyarısı, arşivleme ve makine geçmişi çalışıyor.
- [ ] Servis durum geçişleri, onay eşiği/tutarı, garanti, kapora ve servis sayacı testleri geçti.
- [ ] ServicePart, stok hareketi, negatif stok, hasarlı stok ve çevrimdışı stok çakışması testleri geçti.
- [ ] Seri takipli makine satışı ve satın alma/iade akışları çalışıyor.
- [ ] Veresiye tahsilattan ayrıldı; kısmi ödeme, ödeme tahsisi, iade, iptal ve müşteri/tedarikçi bakiyesi mutabık.
- [ ] Açılış stokları ve bakiyeler örnek dosyayla içe aktarıldı; çift yükleme önlendi.
- [ ] Eşitleme idempotency, hata kuyruğu ve çok cihaz çakışma testleri geçti; toplam uyuşmazlığı akışı doğrulandı.
- [ ] Yedekten geri yükleme tatbikatı yapıldı; RPO ≤24 saat ve RTO ≤1 iş günü hedefi ölçüldü.
- [ ] PIN, hesap kurtarma, cihaz iptali ve veri dışa aktarma güvenliği test edildi.
- [ ] iOS/Android hedef cihazlarda QR, kamera, çevrimdışı veri, fotoğraf kuyruğu ve yazdırma test edildi.
- [ ] KVKK aydınlatma metni, saklama ve veri lokasyonu hukuk danışmanıyla kontrol edildi.
- [ ] Türkçe karakter, TL, tarih, CSV/XLSX dışa aktarma ve PDF fişler kontrol edildi.
- [ ] Kullanıcıya hata, eşitleme çakışması, son yedek ve bekleyen kayıtlar anlaşılır gösteriliyor.
- [ ] Kritik işlem düzeltme geçmişi ve arşivleme doğrulandı.
- [ ] MVP kapsamı dışındaki özellikler açıkça sonraki sürüme ayrıldı.
- [ ] Kullanıcı kabul testi tamamlandı; bilinen kısıtlar ve işletme kullanım kılavuzu teslim edildi.

## 23. İnceleme notlarının karara bağlanma özeti

| İnceleme konusu | Bu PRD'deki karar | Bölüm |
| --- | --- | --- |
| Seri numaralı birim | ProductSerialUnit eklendi; satın alma, satış, iade akışları tanımlandı. | 5.3, 7, 8 (ST-012) |
| Alacak/borç bakış açısı | İşletme bakış açısı ve işaret kuralı yazıldı; OpeningBalance yönü OWED\_BY\_PARTY/OWED\_TO\_PARTY. | 9.3, Ek A |
| Ödeme tahsisi, avans, fazla ödeme | PaymentAllocation, varsayılan en eski kalemden tahsis, fazla ödeme müşteri alacağı; yaşlandırma yalnız borç kalemleri. | 9.4, 15 |
| Sahipsiz alacak çelişkisi | Sahipsiz alacak kaldırıldı; müşteri seçimi zorunlu. | 5.3, 9.4 |
| Servis iptali ve durum tablosu | İş tamamlandı durumundan iptal eklendi; teslim sonrası düzeltme servis iadesiyle; iptalde inceleme ücreti; İşlemde → Müşteri onayı geçişi eklendi. | 6.1, SR-017 |
| Onay eşiği | Ayarlanabilir eşik ve tolerans; onaysız işlemde geçiş engeli. | SR-004, SR-005 |
| Servis vergi/indirim alanları | ServiceOperation ve ServicePart'a eklendi; ürün bazlı varsayılan KDV. | 7, 9.2 |
| Çevrimdışı toplam uyuşmazlığı | Ortak hesaplama modülü; fark çakışma kuyruğuna alınır. | 7.2, 11.3 |
| Kayıp cihaz | Cihaz iptali, yerel veri silme, karantina, azami çevrimdışı süre; ilk eşitleme kapsamı. | 11.2, 11.4 |
| Hasarlı/karantina stok | DAMAGED bucket, damaged\_qty, hasarlıdan çıkış kuralları. | 8 (ST-007, ST-011) |
| Maliyet snapshot'ı | unit\_cost\_snapshot ServicePart, SaleItem, StockMovement'a eklendi. | 7.2 |
| Satış/satın alma durumları ve iptal | DRAFT/FINAL/CANCELLED, RECEIVED; satış iptali iadeden ayrıldı; Machine.status ve diğer değer listeleri tanımlandı. | 7, 9.1, 9.6 |
| Uygulama fazları | Stok/ödeme çekirdeği servisten önceye alındı; eşitleme güvenceleri Faz 1'e taşındı. | 20 |
| v1'den düşen ekran gereksinimleri | Ekran gereksinimleri bölümü geri eklendi. | 4 |
| Mükerrer müşteri/makine uyarısı | Telefon normalizasyonu, uyarı ve AC/TC geri eklendi. | 4.1, 4.2, AC-029 |
| Arşivleme tanımı | Arşiv kuralları, engeller, geri alma ve AC/TC eklendi. | 7.5, AC-030 |
| Eşitleme güvenceleri | version/revision, hata kuyruğu, bağımlı sıralama, UTC, decimal geri eklendi. | 7.4, 11.3 |
| QR yetki ve dışa aktarma uyarısı | QR oturum kontrolü ve hassas veri uyarısı geri eklendi. | 12.2, 14 |
| Erişilebilirlik, izlenebilirlik, bakım | NFR-013 ile NFR-015 eklendi. | 17 |
| UAT ve kullanım kılavuzu | Canlıya çıkış listesine geri eklendi. | 22 |
| Küçük düzeltmeler | FR-016 yazım hatası düzeltildi; cihaz kodu otomatik atanır; kurulumda e-posta toplanır; ImportBatch file\_hash; SR-007 'taslak' ifadesi kaldırıldı; servis geliri tarihi ve KDV rapor tabanı; ServicePart tedarik durumu. | 7, 16, SR-007, SR-019 |
| Kabul/test kapsamı | Kabul kriterleri 51'e, test senaryoları 56'ya genişletildi. | 18, 19 |

## 24. Varsayımlar, işletme onayı gerektiren kararlar ve canlı öncesi doğrulama

Aşağıdaki kararlar bu sürümde öneri olarak yazılmıştır; işletme onayıyla kesinleşir veya değiştirilir.

| Karar | Bu sürümdeki varsayım |
| --- | --- |
| Onay eşiği | 1.000 ₺ (0 = her ücretli işte onay); tolerans varsayılan 0. |
| Çevrimdışı azami süre | 30 gün; aşılırsa yeni kayıt için çevrimiçi doğrulama. |
| İlk eşitleme kapsamı | Ana veri, açık servisler/belgeler ve son 24 ay hareketleri. |
| Belgesiz tahsilat sırası | En eski açık kalemden başlayarak (FIFO), kullanıcı değiştirebilir. |
| Sahipsiz alacak | Yasak; veresiyede müşteri zorunlu. |
| Teslim edilmiş servis | İptal edilemez; ücret düzeltmesi iade akışıyla yapılır. |
| İptalde inceleme ücreti | İsteğe bağlı kalem; varsayılan ücret yok. |
| İptal edilmiş cihazdan gelen kayıtlar | Karantinaya alınır, kullanıcı onayıyla uygulanır. |
| Yaşlandırma bantları | 0–7, 8–30, 31–60, 60+ gün. |
| Hesap kurtarma | E-posta; e-posta girilmezse hesabı kurtaramama riski uyarısı. |
| Negatif stok istisnası | İşletmede kapalı kalması önerilir; açılırsa risk ve gerekçe kayıtları zorunludur. |

Gerçek kullanım öncesinde test edilmesi gereken varsayımlar:

- İşletme tarafından kullanılacak gerçek iOS/Android telefon modelleri ve tarayıcı sürümleri.
- İşletmenin varsayılan KDV davranışı, ürün bazlı oranlar ve servis ücretlerinde vergi gösterimi (mali müşavirle).
- E-posta kurtarma kanalının erişilebilirliği.
- Bulut hizmetinin veri lokasyonu, sözleşmesi ve KVKK değerlendirmesi.
- Etiket/fiş yazıcısı modeli ve kâğıt/etiket boyutları.

Bu doküman resmî fatura veya muhasebe mevzuatına uygunluk garantisi vermez; resmî fatura entegrasyonu sonraki aşamadır.

## Ek A. Terim sözlüğü

| Terim | Tanım |
| --- | --- |
| Tamamlanan servis | İlk kez 'İş tamamlandı' durumuna geçmiş ve iptal edilmemiş servis; servis sayısına dahil edilir. |
| İptal / işlem yapılmadı | Geçmişte saklanır; tamamlanan servis sayısına dahil edilmez. |
| Ödeme durumu | Ödenmedi, kısmen ödendi, tam ödendi, iade edildi; ödeme kayıtlarından türetilir, servis iş durumu değildir. |
| Teslim edildi | Makine müşteriye teslim edilmiştir; teslim zamanı ve teslim alan kişi saklanır. |
| Müşteri borcu | İşletmenin müşteriden alacağı; müşteri bakiyesi pozitiftir. |
| Müşteri alacağı | İşletmenin müşteriye borcu (iade bakiyesi, fazla ödeme, avans); müşteri bakiyesi negatiftir. |
| Tedarikçi borcu | İşletmenin tedarikçiye borcu; tedarikçi bakiyesi pozitiftir. |
| Veresiye | Tahsil edilmemiş alacak durumu; ödeme yöntemi değildir. |
| Kapora | Servis kabulünde alınan ön ödeme; servise bağlı Payment kaydıdır. |
| Arşiv | Normal listelerden gizleme; ilişkili tarihçe korunur, geri alınabilir. |
| Kritik stok | Satılabilir stok miktarı tanımlı kritik seviyeye ulaşmış veya altına inmiştir; hasarlı stok dahil değildir. |
| Hasarlı/karantina stok | Satılabilir stoğa dönmeyen, ayrı izlenen miktar (DAMAGED bucket). |
| Eşitleme bekliyor | Kayıt cihazda saklanmıştır ancak sunucuyla senkronize edilmemiştir. |
| Geçici makine kaydı | Makine henüz belirlenemediğinde açılan, sonradan tamamlanan veya birleştirilen kayıt (TEMPORARY). |
| Snapshot | İşlem anındaki fiyat, vergi, ürün adı veya maliyetin kalemde sabitlenmiş kopyası. |

Servis, Satış ve Stok Yönetimi PRD v2.1
