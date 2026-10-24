# Veltrio Servis — İşletme Kullanım Kılavuzu

Bu kılavuz günlük kullanım içindir. Uygulama içindeki **Menü → Yardım** ekranı kısa özetini taşır.

## 1. İlk kurulum
1. **Hesap oluştur**: e-posta ve şifre (en az 10 karakter, harf ve rakam). E-postanıza gelen bağlantıya dokunun (şifrenizi unutursanız kurtarma bu adrese yapılır).
2. **İşletmenizi kuralım** ekranı: işletme adı, yetkili, telefon, adres, KDV varsayılanı. Kurulum internetle yapılır.
3. **Bu cihazı kaydet**: cihaza bir ad verin (ör. “Dükkân telefonu”). Her telefon/bilgisayar ayrı kaydedilir.
4. Tarayıcı menüsünden uygulamayı **ana ekrana ekleyin** (çevrimdışı açılır). Ayarlar → **Cihaz PIN kodu** ile cihaz kilidi belirleyin.
5. Ayarlar → **İşletme ayarları**: müşteri onayı eşiği, teslim hatırlatma günü, eksi stok, fiş alt metni.

## 2. Günlük işler

**Servis açma:** Ana ekran → *Yeni Servis* → müşteriyi seçin (yoksa ekleyin) → makineyi seçin (bilinmiyorsa “geçici kayıt”) → şikâyet → *kaydet*. Kabul fişini yazdırın. Makine QR etiketi okutarak da başlayabilirsiniz.

**Servis ilerletme:** Servis sayfasındaki sekmeler: *Özet* (durum değiştir, teslim), *Arıza ve teşhis*, *İşlemler, parçalar ve onaylar* (kalem ekle, müşteri kararı), *Kontrol listesi*, *Ödemeler*, *Geçmiş*. Teklif onay eşiğini aşarsa işe başlamadan müşterinin kararı kaydedilir. Stoktan parça kullanıldığında “Kullanımı kaydet” ile stok düşer.

**Teslim ve tahsilat:** İş tamamlanınca *Teslim et*: kalan bakiye görünür; tahsilat alın veya müşteri borcu kabul ediyorsa “borçlu teslim” (isterseniz ödeme sözü tarihi girin).

**Satış:** *Yeni Satış* → ürünleri ekleyin → alınan tutarı yazın. Eksik kalan tutar için **müşteri seçilmelidir** (veresiye). Makine satışında stoktaki birimi (seri no) seçin.

**Tahsilat:** Müşteri sayfası → *Tahsilat al*: tutarı yazın; en eski borçtan başlayarak dağıtım önerilir, değiştirebilirsiniz. Artan tutar müşteri avansı olarak kalır.

**Satın alma:** *Satın Almalar* → yeni → ürün/fiyat → *Teslim al* (stok artar). Tedarikçiye ödemeyi aynı ekrandan yapın.

**Stok:** *Stok* → ürün → *Stok ve hareketler*: giriş, düzeltme (neden yazılır), hasarlı stok. Kritik seviyeye inen ürünler ana ekranda ve bildirimlerde görünür.

## 3. Hata düzeltme (kayıtlar silinmez)
- Yanlış tahsilat: müşteri sayfasında *ters kaydet* (neden yazılır).
- Hatalı satış: satış sayfası → *Satışı iptal et* (stok, tahsilat ve makine kaydı geri alınır).
- Ürün geri geldi: satış sayfası → *İade al* (stok durumu: satılabilir / hasarlı; para iadesi veya müşteri alacağı).
- Tedarikçiye iade: alım sayfası → *Tedarikçiye iade et*.
- Teslim edilmiş servisin ücreti: *Ücret iadesi / düzeltme*.
- Tüm kritik işlemler **Ayarlar → Geçmiş**'te eski/yeni değer, tarih ve gerekçeyle görünür.

## 4. Çevrimdışı çalışma ve sınırlar
- İnternet olmadan kayıt yapabilirsiniz; kayıtlar önce cihazda tutulur, internet gelince otomatik gönderilir. Üstteki simge bekleyen kayıt sayısını gösterir; zil simgesi sorun ve bildirimleri.
- **Sınırlar:** (1) Çevrimdışıyken görülen stok bu cihazın bildiği stoktur; başka cihaz aynı ürünü sattıysa eşitlemede stok eksiye düşebilir (bildirim gelir, düzeltme yaparsınız). (2) Bir cihaz 30 günden uzun süre eşitlenmezse yeni kayıt yapılamaz; internete bağlanıp eşitleyin. (3) İlk kurulum, içe aktarma, ayar kaydı, cihaz iptali ve şifre işlemleri internet ister.
- **Çakışma:** iki cihaz aynı kaydı değiştirirse *Eşitleme ve bildirimler* ekranında seçenek sunulur: *sunucudaki sürümü al* veya *benim değişikliğimi uygula*. Hiçbir şey sessizce ezilmez.
- Tarayıcı verisini silerseniz kayıtlar sunucudan geri iner; eşitlenmemiş kayıtlar kaybolur — bu yüzden bekleyen kayıt varken tarayıcı verisini silmeyin.

## 5. QR etiketi
Makine veya ürün sayfası → *QR etiketi göster / yazdır* → etiket boyutunu seçin → *Yazdır*. QR yalnızca adres taşır; fiyat/stok değişse de etiketi yeniden basmanız gerekmez. Okutmak için Ana ekran → *QR Tara* (telefon kamerası).

## 6. Yedekleme
Sunucu her gece otomatik yedek alır. Ayrıca **Ayarlar → Yedekleme → Yedek al ve indir** ile dosya alabilirsiniz (güvenli saklayın). Geri yükleme **ekleyicidir** (var olanı bozmaz) ve öncesinde otomatik ek yedek indirir.

## 7. Raporlar, dışa ve içe aktarma
*Raporlar*: satış (günlük/aylık), tahsilat (yönteme göre), servis geliri, aktif servisler, stok, makine geçmişi, bakiyeler ve hesap ekstresi. Veresiye tutarı satışta görünür, tahsilatta görünmez. *Dışa aktar*: Excel/CSV; indirmeden önce PIN/şifre sorulur. *İçe aktar*: şablonu indirin, doldurun, yükleyin; hatalı satırlar listelenir; aynı dosya ikinci kez alınmaz.

## 8. Cihaz kayboldu / PIN unutuldu
- Kayıp cihaz: Ayarlar → **Cihazlar** → *İptal et*. Cihaz internete bağlandığında verisini siler.
- PIN: kilit ekranında *PIN'imi unuttum* → şifreyle yeniden giriş. Şifre: giriş ekranında *Şifremi unuttum*.

## 9. Bilinen kısıtlar ve sonraki sürüm
Tek kullanıcı (rol yok); otomatik WhatsApp/SMS yok; e-fatura/e-arşiv yok; fotoğraflar küçültülüp veritabanında tutulur; müşteri verisi anonimleştirme ekranı sonraki sürümde.
