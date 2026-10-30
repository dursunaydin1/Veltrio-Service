# Karar Günlüğü

> Plandan (docs/00–07) veya PRD'den sapmaların, düzeltmelerin ve yeni çözümlerin kaydı. Yeni kayıtlar en üste eklenir.
> Biçim: **Ne değişti → Neden → Sonuç / etkilenen dosyalar**

## 2026-10-30

### K-052 · Menü simgesi: iki çizgi
- **Neden:** Dört kare simgesi "uygulamalar/panel" anlamı taşıyordu ve köşeli, kalabalık biçimiyle çubukta dikkati ortadaki logodan çekiyordu.
- **Seçim:** Dört seçenek (dört kare, iki çizgi, işletme rozeti, üç nokta) aynı çubukta karşılaştırıldı; işletme sahibi önerimi onayladı: biri kısa iki yatay çizgi, adı "Menü" kaldı. Herkes menü diye okur, sıradan üç çizgiden ayrışır, çubuğun en hafif simgesidir.
- **Etki:** `BottomNav.tsx` (`MenuLines`).

### K-051 · Premium kimlik: pirinç vurgu ve kıvrımlı onay logosu
- **Neden:** İşletme sahibi premium bir görünüm istedi. Vurgu mavisi (#3b82f6) hazır kütüphanelerin varsayılanıydı; pek çok SaaS uygulamasıyla aynı görünüyordu. Başka bir araçla üretilen tabela görselindeki kıvrımlı onay işaretini beğendi.
- **Seçim:** Üç vurgu (mevcut mavi, pirinç, buz beyazı) aynı mini ekranda karşılaştırıldı; işletme sahibi seçimi bana bıraktı, **lacivert + pirinç** seçildi. Saat, kalem, özel bankacılık gibi premium markaların klasik eşleşmesi; motor ve usta işi dünyasına uygun; SaaS'ta nadir. Görseldeki turkuaz alınmadı ("tamam" yeşiliyle karışır).
- **Logo:** Görseldeki onay işareti düz renkle yeniden çizildi (ayrı kısa parça pirinç, kıvrılarak sivrilen uzun kol beyaz), gece mavisi kare zemin, ince pirinç halka. 40 px altında halka çizilmez, onay büyütülür (sekme simgesi dahil). 3B parlama/kabartma alınmadı (kural 14; küçük boyutta bulanıklaşır).
- **Renkler:** Vurgu #c8a464, pirinç düğmede yazı koyu. Uyarı sarısı pirinçle karışmasın diye turuncuya alındı (#f97316). Bilgi rozetleri mavi kaldı.
- **Yazı:** "Veltrio" iri (Sora), "SERVICE" küçük, harf aralıklı, pirinç; üst çubukta yan yana, giriş ekranında alt alta.
- **Etki:** `globals.css` (jetonlar, `.wordmark`, logo düğmesi), `Logo.tsx` (`LogoGlyph`, `LogoMark`, `Wordmark`), `scripts/make-icons.mjs` (eğri desteği, iki renk), `public/icons/*`; simge adresleri `?v=4`, çevrimdışı önbellek `v3` (tarayıcı sekmesi ve ana ekran simgesi yenilensin). Kural 14 güncellendi.

## 2026-10-22

### K-039 · Hesap, kurulum ve cihaz güvenliği
- **Hesap:** Kimlik doğrulama Supabase Auth'tadır (parola özeti, JWT/yenileme, e-posta doğrulama/kurtarma). Uygulama kayıt, şifre sıfırlama ve yeni şifre ekranlarını sağlar; şifre politikası istemcide (`validatePassword`) ve Supabase panelinde uygulanır. Girişten sonra `next` ile aynı sayfaya dönülür (QR); yalnızca uygulama içi yollar kabul edilir.
- **İlk kurulum:** `setup_business` (SECURITY DEFINER) yalnızca oturum açmış ve işletmesi olmayan hesap için işletme + kullanıcı + varsayılan ayarları yazar; tarayıcı bu tablolara doğrudan ekleme yapamaz.
- **PIN:** Oturum zaten açık cihazda hızlı kilit; PIN sunucuya gönderilmez, PBKDF2-SHA-256 ile özetlenir. Unutulursa şifreyle yeniden giriş yapılır.
- **Cihaz iptali:** İptal çevrimiçi yapılır, geri alınamaz. İptal edilen cihaz bağlanınca (açılış, odak, internet, eşitleme 403) yerel veritabanını ve oturumu siler, `wipe_confirmed_at` yazar. Eşitlenmemiş bekleyen kayıtlar da silinir.
- **Etki:** migration 024, `lib/auth/*`, `lib/pin/*`, `lib/device/*`, `SetupWizard`, `PinGate`, `useDeviceGuard`, `DeviceManager`.

### K-050 · Yeni kayıt tek yerden: ana sayfa kutuları kaldırıldı, hızlı seçime "+" işareti
- **Sorun:** Ana sayfadaki "Servis aç" ve "Satış yap" kutuları, hemen alttaki logolu düğmenin hızlı seçimini tekrar ediyordu. Ayrıca hızlı seçimdeki Servis/Müşteri simgeleri alt çubuktaki Servisler/Müşteriler sekmeleriyle aynıydı; ikisi aynı işmiş gibi görünüyordu.
- **Değerlendirme:** Kutular tek dokunuş, hızlı seçim iki dokunuştur. Ama uygulamayı tek kullanıcı kullanıyor ve düğmeyi biliyor. Logolu düğme her sayfada aynı yerde; "yeni kayıt hep ortadan açılır" tek alışkanlıktır. Ana sayfanın işi "şu an ne yapmalıyım?" sorusunu yanıtlamaktır (bugünkü işler, geciken servisler).
- **Yapılanlar:** (1) Ana sayfa kutuları kaldırıldı; arama ve QR kaldı (hızlı seçimde yoklar). (2) Hızlı seçim ikonlarına küçük mavi "+" eklendi: sekmeler listeyi açar, bunlar yeni kayıt. (3) Açık servis yokken boş liste "Servis aç" düğmesi gösterir (yalnızca o durumda, bağlama uygun). (4) Yardım ve kullanım kılavuzu güncellendi.
- **Geri dönüş koşulu:** Servis açarken iki dokunuş yavaşlatırsa ana sayfaya tek bir "Servis aç" düğmesi geri getirilir.

### K-049 · Hızlı seçimde "Diğer" kaldırıldı
- **Sorun:** "Diğer" alttan bir panel açıyordu; panelde hızlı seçimdeki üç seçenek (servis, satış, müşteri) yeniden listeleniyordu. İşletme sahibi bunu gereksiz buldu.
- **Çözüm:** "Diğer" ve alttan açılan panel (`CreateSheet`) kaldırıldı. Ürün ekle ve Satın alma doğrudan hızlı seçime eklendi; tüm "yeni kayıt" işleri tek dokunuşla açılır.
- **İkon satırı:** Alt alta liste yerine düğmenin üstünde tek satır yuvarlak ikonlar (Müşteri, Satış, Servis, Ürün, Satın al); Servis ortada, logolu düğmenin tam üstünde. Telefonda "üzerine gelme" olmadığından yalnızca ipucunda görünen ad işe yaramaz; bu yüzden her ikonun altında tek kelimelik kısa ad hep görünür, bilgisayarda üzerine gelince tam ad da çıkar.

### K-048 · Alt çubuk: yüzen çubuk, logolu düğme ve hızlı seçim
- **Neden:** Ortadaki "+" her uygulamada olan sıradan bir işaretti; işletme sahibi daha özgün ve işlevsel bir alt menü istedi, seçimi bana bıraktı.
- **Yapılanlar:** (1) Ortadaki düğme Veltrio logosu (dişli + onay); basınca logo dönerek × olur. (2) "+" paneli yerine düğmenin üstünde hızlı seçim: Servis aç (düğmeye en yakın), Satış yap, Müşteri ekle, Diğer (tam listeyi açar). (3) Çubuk kenarlardan boşluklu, yuvarlak köşeli yüzen bir kart. (4) Servisler sekmesinde teslimi geçen + onay bekleyen servis sayısı rozeti. (5) Açık sekmeye yeniden dokununca sayfanın başına dönülür. (6) Dokunuşta kısa titreşim (yalnızca destekleyen Android tarayıcıları).
- **Yapılmayanlar:** Düğme için çubukta oyuk (yüzen çubukla kalabalık, kural 14'teki efekt kısıtı), kaydırınca çubuğu gizleme (kafa karıştırıcı), sekmeler arası kayan vurgu (katkısı az).

### K-047 · Kendini onaran eşitleme ve görünür yükleme durumu
- **Sorun:** İşletme sahibinin tarayıcısında ana sayfa "Açık servis yok" gösterdi; sunucuda veriler yerindeydi (26 müşteri, 19 servis…). Yerel veritabanı boştu ama eşitleme imleci ilerlemiş olduğundan eksik kayıtlar bir daha inmiyordu. Ayrıca K-045'teki sessiz gösterge, başarısız indirmeyi hiç göstermiyordu.
- **Kendini onarma:** İmleç ilerlemiş ama cihazda bu işletmeye ait hiç müşteri/servis/ürün yoksa eşitleme her şeyi kendiliğinden baştan indirir (`shouldRepullEverything`; `put` ile yazıldığından kopya oluşmaz). Elle "yeniden indir" düğmesi eklenmedi (işletme sahibinin isteği: otomatik olmalı).
- **Yeniden deneme:** Başarısız eşitleme 15 sn, 30 sn, 1 dk, 2 dk aralıklarla kendiliğinden tekrar denenir.
- **Gösterge:** "Eşitlenemedi" (dokununca yeniden dener) ve tüm veri baştan inerken "Yükleniyor" görünür; ana sayfa listesi o sırada "Veriler yükleniyor…" der, "Açık servis yok" demez.
- **Logo ve sekme:** Logo koyu maviye alındı (kırmızı lacivert ekranda sırıtıyordu); sekmede tüm sayfalarda logo ve "Veltrio Service" yazar; simge adresine sürüm eklendi ve çevrimdışı önbellek sürümü artırıldı ki tarayıcı eski simgeyi bıraksın.

### K-046 · Lacivert palet, yeni logo ve "Veltrio Service" adı
- **Seçim:** İşletme sahibi dört koyu paleti (lacivert, turkuaz, arduvaz, turuncu) gerçek ana ekran üzerinde karşılaştırdı ve **lacivert**i seçti. Çalışma kuralı 14 buna göre güncellendi (eski "gri + turuncu, mavi/lacivert yok" kuralının yerini aldı).
- **Neden lacivert:** Mavi vurgu, durum renkleriyle (kırmızı = gecikme/sorun, sarı = bekliyor, yeşil = tamam) çakışmaz; turuncu sarıya, turkuaz yeşile yakındı. Lacivert zemin saf siyahtan yumuşaktır; mavi düğmede beyaz yazı güneş altında okunur.
- **Uygulama:** Zemin #0b1120, vurgu #3b82f6 (beyaz yazı), logo koyu mavi #1d4ed8 (önce kırmızı denendi; lacivert ekranda sırıttığı için işletme sahibinin isteğiyle maviye alındı, kırmızı yalnızca uyarılarda). Kural 14 gereği gradyan ve parlama kaldırıldı; renkler düz. Mavi düğmelere ayrıldığı için başlangıç servis durumları (kabul, teşhis) mor-gri rozetle gösterilir.
- **Logo:** Koyu mavi zeminde beyaz **dişli** (servis/tamir) ve içinde **onay işareti biçiminde V** (iş tamam). Uygulama simgeleri ve tarayıcı sekmesi simgesi (`public/icons/favicon.svg`) `scripts/make-icons.mjs` ile aynı geometriden üretilir.
- **Ad:** Üst çubukta işletme adı yerine **Veltrio Service** yazar (giriş ekranı, sekme başlığı ve manifest de). İşletme adı Menü sayfasının başında görünür.

### K-045 · Ana ekranın sadeleştirilmesi ve sessiz eşitleme göstergesi
- **Eşitleme göstergesi:** Eşitleme otomatik olduğundan (açılış, internet gelince, uygulamaya dönünce, her kayıttan sonra) üst çubukta yalnızca dikkat gereken durumda görünür: çevrimdışı, sorun (hata/çakışma) veya **15 saniyeden uzun** gönderilemeyen kayıt. Her kayıttan sonra kısa süre çıkan "1 bekliyor" artık görünmez. (K-012'deki "her zaman görünen gösterge" kuralı bu şekilde güncellendi.) Son eşitleme zamanı Menü'dedir.
- **Ana ekran:** selam ve tarih üst çubukta işletme adının altında küçük satır; üstteki arama simgesi yalnızca ana sayfada gizli (büyük arama kutusu var); "Bugün yapılacaklar" iş yokken hiç görünmez; devam eden servislerde en acil 3 kayıt ve başlıkta "Tümü (n)"; uyarılar tek satırlık, X ile bir hafta kapanan şerit.
- **Düğme adları:** "Yeni …" yerine eylem fiilleri: **Servis aç**, **Satış yap**, **Müşteri ekle**, **Ürün ekle**.

### K-044 · Telefon uygulaması düzeni (tek görünüm)
- **Neden:** İşletme sahibi v2 tasarımı "ERP gibi" buldu; telefon uygulaması gibi sade bir düzen ve bilgisayarda da **aynı** görünümü istedi.
- **Alt menü:** Ana Sayfa · Servisler · **+** · Müşteriler · Menü. "+" alttan sade bir liste açar (yeni servis, satış, müşteri, ürün, satın alma). Satışlar ve Stok Menü'de en üstte (PRD §4.7'deki beş sekmeden sapma: + paneli ve Menü ile aynı yerlere bir dokunuşla erişilir).
- **Tek görünüm:** Geniş ekranda kenar çubuğu yok; uygulama ortada telefon genişliğinde (560 px) bir sütun olarak açılır.
- **Ana sayfa:** selam, tek satırda arama + QR, iki büyük kutu (yeni servis / satış), "Bugün yapılacaklar" cümleleri, teslim tarihine göre sıralı servis kartları ("Yarın teslim", "2 gün gecikti").
- **Yeni servis adım adım:** Müşteri → Makine → Şikâyet → Ek bilgiler (hepsi isteğe bağlı) + özet; seçim adımları dokununca ilerler, QR/makine sayfasından gelindiğinde doğrudan şikâyet adımı açılır. Bu ekranda alt menü gizlenir.
- **Kaldırılanlar:** Menü'deki tema seçici (yalnızca koyu tema; K-043'teki açık tema geri alındı), üst çubuktaki menü simgesi (alt menüdeki "Menü" ile aynıydı).

### K-043 · Arayüz yenilemesi (tasarım sistemi v2)
- **Neden:** İşletme sahibi tasarımı eski ve telefonda kullanışsız buldu; daha modern ve kullanıcı dostu bir görünüm istedi.
- **Ne değişti:** `globals.css` yeniden yazıldı (renk değişkenleri, kartlar, gruplanmış listeler, kaydırılabilir sekmeler, rozetler, uyarılar, form alanları). Bileşenler zaten yalnızca ortak sınıf ve değişkenleri kullandığı için değişiklik tüm ekranlara yansır. Yeni: logo işareti, bulanık üst çubuk, etkin öğesi vurgulu alt menü, geniş ekranda sol kenar çubuğu, ana sayfada karşılama + öne çıkan "Yeni Servis" + simgeli durum kutuları + devam eden servisler, servis detayında özet kartı + 5 adımlı ilerleme çubuğu + tek birincil "sonraki adım" düğmesi.
- **Tema:** Koyu tema varsayılan kalır (önceki kural). İlk sürümde eklenen açık tema seçici K-044 ile kaldırıldı.
- **Uyarılar:** "Tarayıcı verileri silebilir" bilgisi kapatılabilir (bir hafta) ve ana ekrana ekleme önerisi görünürken ayrıca gösterilmez; depolama dolu/desteklenmiyor uyarıları kalıcıdır.
- **Geri dönüş:** Önceki tasarım GitHub'da `tasarim-oncesi` etiketiyle saklanır.

### K-042 · Sağlamlaştırma: PWA, performans ve migration doğrulaması
- **PWA:** `public/sw.js` yerel service worker (next-pwa Turbopack'le uyumsuz). Giriş/API/kimlik yolları asla önbelleğe alınmaz; yalnızca yönlendirilmemiş HTML yanıtları sayfa önbelleğine girer. `public/icons` boş olduğundan uygulama kurulabilir değildi; simgeler üretildi.
- **Performans:** `getBalances` imleç yerine toplu okuma kullanır (6.000 hareketle ~23 sn → <1 sn, taklit ortamda). Düğmeler ≥ 44 px.
- **Doğrulama:** 001→024 migration'ları gerçek bir PostgreSQL 16'ya (gömülü, Supabase stub'larıyla) uygulanıp `setup_business` ve tabloların oluştuğu doğrulandı; migration'ları tek yapıştırmada çalıştırmak için `supabase/bundles/021-024.sql`.
- **Bilinen sınır:** Cihaz, kamera, yazdırma ve hukuki maddeler otomatik test edilemez; `docs/09`-`13`'te ayrı listelendi ve Faz 7 kapanışına insan onayı gerekir.

### K-041 · Raporlar, dışa/içe aktarma ve bildirim merkezi
- **Raporlar saf hesaptır** (`reports/calc.ts`, kuruş tam sayı, Europe/Istanbul takvimi) ve ayrı tanımlıdır: **satış** (kesinleşmiş belge; brüt KDV dahil, indirim/KDV bilgi sütunu, iade ve iptal kendi tarihinde düşer), **tahsilat** (fiilî ödeme hareketleri; veresiye girmez; müşteri iadeleri/ters kayıtlar ayrı sütun), **servis geliri** (tamamlanma tarihine göre tahakkuk; iade düşer; iptalde alınan inceleme ücreti eklenir).
- **Dışa aktarma:** ekranda gösterilen sütun tanımı dosyada da kullanılır. Kimlik doğrulama: PIN varsa PIN, yoksa çevrimiçi hesap şifresi; çevrimdışı ve PIN yoksa uyarıyı onaylamak yeterlidir. Her dışa aktarma audit log'a yazılır.
- **İçe aktarma:** doğrulama saf fonksiyonlar, uygulama tek Dexie işlemidir; hata olursa hiçbir kayıt yazılmaz. Aynı dosya SHA-256 özetiyle (yerel + sunucu `UNIQUE`) engellenir. `ImportBatch.row_count` uygulanan (eklenen + birleşen) satırdır.
- **Çakışma çözümü:** bildirim merkezinde yeniden dene / “benim değişikliğimi uygula” (sunucudaki güncel sürüm numarasıyla yeniden gönder) / “sunucudaki sürümü al”. İkisi de çevrimiçi gerektirir; kayıt hiçbir zaman sessizce ezilmez.
- **Bilinen sınır:** `xlsx` (SheetJS 0.18.5) paketi yalnızca kullanıcının kendi yüklediği dosyalar ve dışa aktarma için kullanılır; yükleme boyutu 5 MB ve 5.000 satırla sınırlıdır.

### K-040 · Arama ve yedekleme
- **Arama:** Tüm veri cihaza eşitlendiğinden arama yerel yapılır (çevrimdışı da çalışır); ayrı sunucu arama uç noktası açılmadı. Çevrimdışıyken yalnızca eşitlenmiş kayıtların arandığı uyarılır.
- **Yedekleme:** Elle yedek JSON dosyasıdır; geri yükleme ekleyicidir (var olanı ezmez), öncesinde otomatik ek yedek ve audit log vardır. Günlük otomatik yedek bir sunucu görevidir (`/api/cron/backup`, servis anahtarı ve `CRON_SECRET` gerekir); depo `backups`, durum `business_backups`. Görevin gerçek projede çalışması yapılandırma bekler (belge: supabase/README.md).
- **Etki:** `lib/search/*`, `lib/backup/*`, `BackupManager`, `GlobalSearch`.

### K-038 · Stok bildirimleri ve bütünlük denetimi
- **Karar:** Kritik stok bildirimi `LOW_STOCK:{ürün}:{n}` anahtarıyla üretilir: açık bildirim varken yenisi açılmaz, miktar toparlanınca çözülür, tekrar düşünce `n+1` ile yeni bildirim açılır (AC-028). Eksiye düşen stok için `SYNC_CONFLICT` türünde bildirim (`NEGATIVE_STOCK:{ürün}:{n}`) üretilir; hareketler silinmez, telafi stok düzeltmesi veya işlem iptaliyle yapılır (ST-003, AC-009). Bildirim kimlikleri anahtardan türetildiği için iki cihaz aynı olayı üretince sunucuda çakışmaz.
- **Denetim:** Ürün stok özeti ile hareket defteri karşılaştırılır; fark varsa defter esas alınır, yerel özet düzeltilir, audit log yazılır (`Ayarlar → Veri denetimi`). Hareketler değiştirilmez.

### K-037 · İptalde inceleme / teşhis ücreti
- **Karar:** İptal edilen servis normalde bakiyeye girmez. İnceleme/teşhis ücreti alınacaksa iptal formunda tutar girilir (`services.cancel_fee`, migration 023); servis iptal olarak kalır, `first_completed_at` boş kalır (sayaç artmaz), tutar servis ve müşteri bakiyesine borç olarak yazılır, açık kalem olarak tahsil edilir.
- **Etki:** `services/service.ts` (`changeServiceStatus` seçeneği, `getServiceBalance`), `finance/service.ts`, `finance/openItems.ts`, servis iptal formu.

### K-036 · Fotoğraflar, QR ve girişten sonra dönüş
- **Fotoğraf (FR-028):** Fotoğraf istemcide 1600 px'e küçültülmüş JPEG olarak, kayıt üzerinde metin (data URL) sütununda saklanır (`customers.photo`, `products.photo`, `services.intake_photo`; migration 022). Çevrimdışı çalışma ve basit eşitleme için dosya depolaması yerine bu seçildi; yüksek hacimde Supabase Storage'a taşınması Faz 7'de değerlendirilir.
- **QR:** QR yalnızca değişmeyen kayıt adresini taşır (AC-035). Giriş yoksa proxy `?next=` ile girişe yönlendirir; yalnızca uygulama içi yollar kabul edilir (`safeNextPath`).
- **Geçici makine birleştirme:** aynı müşterinin etkin makinesiyle; servisler taşınır, kayıt silinmez (arşiv + `merged_into_id`).
- **Etki:** migration 022, `images/resize.ts`, `qr/payload.ts`, `QrLabel`, `QrScanner`, `mergeTemporaryMachine`, `proxy.ts`, `login/actions.ts`.

### K-035 · Kataloglar, şablonlar, kontrol listesi, garanti
- **Karar:** Arıza ve işlem katalogları, servis şablonları ve servis kontrol listesi yeni senkronize tablolardır (migration 021). Katalog yalnızca **kolay seçim** içindir: servise açıklama/fiyat kopyalanır, katalog değişse geçmiş satırlar değişmez. Şablon maddeleri servise kendi başlık kopyalarıyla yazılır (AC-005). Zorunlu madde uyarısı engel değil **uyarıdır**; kullanıcı onaylarsa tamamlanır.
- **Sapma:** `ServiceIssue` ayrı tablo olarak açılmadı; şikâyet metni serviste, katalog seçimi hızlı düğme olarak kalır (ayrı tablo ek değer katmıyordu).
- **Garanti:** `services.warranty_source/warranty_coverage` ve `machines.warranty_until` (migration 021). Garanti bitişi yalnızca bilgidir; kapsamı kullanıcı doğrular.
- **Etki:** migration 021, `catalog/service.ts`, `services/checklist.ts`, `ChecklistPanel`, `CatalogManager`, `TemplateManager`, `/settings/*`.

### K-034 · Vade tarihi belgede; belgesiz tahsilat tahsisi; bildirim kimliği
- **Vade (plan sapması):** Plan vadeyi `Payment`'ta tutmayı söylüyordu. Ödenmemiş alacak henüz bir ödeme olmadığından vade **belgeye** yazılır: `sales.due_date`, borçlu teslimde `services.due_date` (migration 020). Boşsa vade yoktur: hatırlatma üretilmez, yaşlandırma belge tarihine göre yapılır.
- **Tahsis:** Belgeden alınan ödeme `source_id` ile o belgeye bağlıdır. Belgesiz genel tahsilat `payment_allocations` ile açık kalemlere dağıtılır (varsayılan en eski kalem önce, kullanıcı değiştirebilir); dağıtılmayan kısım avans olarak kalır ve onayla mahsup edilir. Tahsisler ters kaydedilmiş ödemelerde sayılmaz. Net bakiye hesabı değişmedi (belgelerden hesaplanır); `creditKurus` = brüt açık borç − net bakiye.
- **Bildirimler:** `PAYMENT_DUE` bildirimi vade gününde ve 7 günü aşınca bir kez üretilir; kimlik `dedupe_key`'den deterministik türetilir (uuid v5) ki birden fazla cihaz aynı olayı üretince sunucudaki UNIQUE (işletme, dedupe_key) kısıtı çakışmasın.
- **Etki:** migration 020, `finance/{aging,allocated,openItems}.ts`, `notifications/paymentDue.ts`, `OpenItemsPanel`, `BalanceReport`, `usePaymentDueReminders`.

### K-033 · Servis ücret iadesi ve eşitleme hatası düzeltmesi
- **Karar:** Teslim öncesi iptalde alınan kapora ters finans hareketiyle (servise bağlı OUT ödeme, tutar sınırlı) iade edilir; iade edilmezse müşteri alacağı olarak bakiyede kalır. İptal edilmiş servisin tutarı 0 sayılır. Teslim sonrası düzeltme `return_transactions` (`original_type = SERVICE`) ile yapılır: parça iadesi (stok durumuyla) ve/veya parçaya bağlı olmayan tutar; para kuralı satış iadesiyle aynıdır (K-031). Kullanılmış parça stoğu iptalde otomatik geri eklenmez.
- **Düzeltilen hata (sunucu testiyle bulundu):** Yeni servis kaydının `debt_acknowledged` alanı `null` gönderiliyordu; sunucu sütunu NOT NULL olduğundan (migration 015) yeni servisler eşitlenemiyordu. Artık varsayılan `false` gönderilir; regresyon testi eklendi.
- **Etki:** `returns/service-return.ts`, `services/service.ts` (`getServiceBalance.returned`, iptalde tutar 0), `finance/service.ts` (müşteri bakiyesi), `ServiceReturnPanel`.

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
