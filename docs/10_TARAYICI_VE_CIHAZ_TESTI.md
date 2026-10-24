# Tarayıcı, Cihaz ve PWA Test Planı (Adım 7.1)

Otomatik testler yerel veritabanı, hesaplamalar ve eşitleme mantığını doğrular; **kamera, yazdırma, ana ekrana ekleme ve tarayıcının veri silme davranışı gerçek cihazda elle denenmelidir.** Bu belge hangi tarayıcıların desteklendiğini ve cihaz testinin nasıl yapılacağını verir.

## Desteklenen tarayıcılar (yayınlanacak matris)

| Platform | Tarayıcı | Durum |
|---|---|---|
| Android 10+ | Chrome (güncel), Edge, Samsung Internet | Desteklenir; ana ekrana ekleme tek dokunuş |
| iOS / iPadOS 16.4+ | Safari | Desteklenir; **ana ekrana eklenmiş (PWA) kullanım önerilir** (Safari, kullanılmayan sitenin verisini 7 gün sonra silebilir; ana ekrana eklenen uygulamalarda bu uygulanmaz) |
| iOS | Chrome / Edge (WebKit tabanlı) | Safari ile aynı kısıtlar |
| Windows / macOS | Chrome, Edge (güncel) | Desteklenir |
| Firefox | Güncel | Çalışır; kurulum (PWA) desteği sınırlıdır |

Gereken tarayıcı özellikleri: IndexedDB, Service Worker, `crypto.subtle` (PIN ve dosya özeti), `navigator.mediaDevices` (QR için kamera), `Intl` (tr-TR / Europe/Istanbul).

## Uygulamadaki karşılıklar

- **Service worker** (`public/sw.js`): uygulama kabuğunu önbelleğe alır; giriş sonrası temel sayfalar önceden indirilir; çevrimdışı açılışta son görülen sayfa / `/offline` gösterilir. API ve giriş yolları asla önbelleğe alınmaz.
- **Kalıcı depolama**: giriş sonrası `navigator.storage.persist()` istenir. İzin verilmezse veya alan %80'i geçerse ekranın üstünde uyarı çıkar (`PwaBanner`); eşitlenmemiş kayıt varsa uyarı daha serttir.
- **Önbellek temizleme riski**: kritik veri yalnızca tarayıcıya emanet değildir; her kayıt sunucuya eşitlenir, günlük sunucu yedeği ve elle yedek vardır.
- **Ana ekrana ekleme**: Android'de “Ana ekrana ekle” düğmesi, iOS'ta “Paylaş → Ana Ekrana Ekle” yönergesi (bir hafta ertelenebilir).

## Cihaz test listesi (her hedef cihazda işaretleyin)

| # | Test | Android Chrome | iOS Safari (ana ekran) | Masaüstü Chrome |
|---|---|---|---|---|
| 1 | Giriş, PIN belirleme, kilit ekranı | ☐ | ☐ | ☐ |
| 2 | Ana ekrana ekleme; simge ve ad doğru | ☐ | ☐ | ☐ |
| 3 | Uçak modunda uygulamayı açma; son sayfa görünüyor | ☐ | ☐ | ☐ |
| 4 | Çevrimdışı servis + satış kaydı; internet gelince eşitleniyor | ☐ | ☐ | ☐ |
| 5 | QR etiketi yazdır / PDF kaydet (A4 ve dar) | ☐ | ☐ | ☐ |
| 6 | QR Tara (kamera izni) → makine/ürün açılıyor | ☐ | ☐ | — |
| 7 | Fotoğraf ekleme (kamera/galeri), küçültme, çevrimdışı kayıt | ☐ | ☐ | ☐ |
| 8 | Servis fişi yazdır / PDF kaydet | ☐ | ☐ | ☐ |
| 9 | CSV/Excel indir; Türkçe karakterler Excel'de doğru | ☐ | ☐ | ☐ |
| 10 | Tarayıcı verisini silince: giriş sonrası sunucudan geri geliyor | ☐ | ☐ | ☐ |
| 11 | Tek elle kullanım, yatay kaydırma yok (360 px genişlik) | ☐ | ☐ | — |
| 12 | Dış mekânda okunabilirlik (parlak ışıkta kontrast) | ☐ | ☐ | — |

Bulunan sorunlar `docs/KARAR_GUNLUGU.md`'ye ve düzeltme listesine yazılır.
