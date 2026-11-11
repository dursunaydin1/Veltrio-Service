# QA / Otomatik Test Düzeneği

Amaç: Her adımdan sonra "proje sağlam mı?" sorusunu tarayıcıda elle denemeden, tek komutla yanıtlamak. Dört katman var:

| Katman | Komut | Ne doğrular | Sunucu verisi |
|---|---|---|---|
| 1. Tip denetimi | `npx tsc --noEmit` | Tip/yazım hataları | yok |
| 2. Birim + iş akışı testleri | `npm test` (günlük: `npm run check`, değişenle ilgili testler; tamamı her push'ta GitHub Actions'ta) | İş kuralları, hesaplar, stok defteri, kuyruk, servis/alım/satış akışları (yerel Dexie taklidiyle) | yok |
| 2b. Ekran (bileşen) testleri | `npm test` (aynı komut; `*.test.tsx`) | Ortak ekran parçalarının davranışı: miktar − / +, ödeme yöntemi çipleri, onay / metin penceresi, isteğe bağlı alan çipi (Testing Library + jsdom, K-117). Yeni ortak parça eklenince testi de yazılır | yok |
| 3. Sunucuya karşı uçtan uca | `npm run test:e2e` | Katman 2'deki iş kodunu çalıştırıp kuyruğu gerçek Supabase'e gönderir; RLS, kısıtlar, yabancı anahtar sırası, tetikleyiciler, sürüm çakışması, ikinci cihazdan çekme | **Evet** (adı `E2E-XXXX` ile başlayan test kayıtları) |

## Katman 3'ü çalıştırma
```
E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e      (bash)
$env:E2E_EMAIL="..."; $env:E2E_PASSWORD="..."; npm run test:e2e   (PowerShell)
```
- URL ve anon anahtar `.env.local`'dan okunur; kimlik bilgileri yalnız ortam değişkeninden gelir, dosyaya yazılmaz.
- Değişkenler yoksa test **atlanır** (hata vermez).
- Her çalıştırma yeni bir cihaz koduyla (`DEMO-XXXX`) yapılır; belge numaraları çakışmaz.
- Muhasebe/stok kayıtları değiştirilemez olduğundan test verisi sunucuda kalır. Silinmesi gerekirse deneme işletmesi/veri tabanı sıfırlanır; asıl veri için ayrı bir "test işletmesi" kullanmak önerilir.

## Kapsanan akışlar (`e2e/server.e2e.ts`)
tedarikçi + açılış bakiyesi + ödeme · müşteri · ürün + açılış stoğu (sunucu stok özeti) · teslim alınmış alım (stok, son alış fiyatı, tedarikçi borcu) · veresiye satış + kısmi tahsilat · müşterisiz peşin satış · idempotent tekrar gönderim ve sürüm çakışması · seri takipli alım + makine satışı + çift satış engeli · satış iptali (stok, tahsilat, seri birim) · müşteri/tedarikçi/servis iadeleri ve geri alma · yerel veri silinip sunucudan çekilince stok/bakiye eşitliği.

## Kural
Yeni bir iş akışı eklenince: (1) birim testi, (2) e2e dosyasına sunucu doğrulaması eklenir, (3) iki komut da yeşil olmadan commit atılmaz.

## Kapsam dışı (şimdilik)
Tarayıcı arayüzü (render, tıklama), `/api/sync/*` HTTP rotası, PWA/çevrimdışı önbellek. Faz 7'de Playwright ile arayüz testi eklenecek.

## Bu düzenekle bulunan hatalar
- Yeni servis kaydında `debt_acknowledged` null gidiyordu; migration 015'ten beri yeni servisler sunucuya yazılamıyordu → düzeltildi (K-033).
- Eşitlenmemiş INSERT'e UPDATE birleşince kuyruk INSERT yükünü eziyordu (`document_no` kaybı) → internetsizken oluşturulup hemen teslim alınan alım/satış sunucuda reddedilirdi. Düzeltildi (K-029).

## Faz 7 ile eklenen otomatik denetimler
- `test/performance.test.ts`: büyük veri hacminde yerel arama/bakiye/rapor süreleri ve dokunma hedefi CSS denetimi.
- `test/multidevice.test.ts`: iki cihaz son ürünü tüketir, aynı paket tekrar, hata kuyruğu, toplam uyuşmazlığı.
- `test/security.test.ts`, `test/sw.test.ts`: güvenlik başlıkları, service worker kuralları, manifest.
- e2e 7i (işletme izolasyonu, RLS), 7j (yedekten geri yükleme).
- Migration doğrulaması: 001→024 gerçek PostgreSQL'e uygulanır (gömülü Postgres + Supabase stub'ları); kanıt `docs/KARAR_GUNLUGU.md` K-042.
- Elle yapılacaklar: `docs/09`-`13`.

## Patron ve çalışanlar (K-119)
- Otomatik: `lib/auth/permissions.test.ts` (yetki kararı, yol kuralları, izin listesinin 028 ile birebir aynı olması), `lib/auth/staff.test.ts` (davet kodu, "kim yaptı" eşlemesi).
- Elle (028 uygulandıktan sonra, iki hesapla):
  1. Patron: Ayarlar → Çalışanlar → Çalışan ekle → kod WhatsApp ile gider.
  2. Çalışan: yeni e-postayla hesap aç → "Davet kodum var" → kod → cihaz kaydı. Menüde Satın Almalar, Tedarikçiler, Raporlar, Ayarlar yok; Görünüm ve PIN var.
  3. Çalışan satış yapar: fiyat değişmez, indirim alanı yok; tamamı tahsil edilmeden kesinleşmez (veresiye izni kapalıysa). Patron satışta "Satan: …" görür.
  4. Çalışanın adresi elle yazıp `/purchases` açması → "Bu bölüm için yetkiniz yok".
  5. Patron "İptal ve iade" iznini açar → çalışanda satış iptali görünür (yeniden giriş ya da sayfa yenileme sonrası).
  6. Patron çalışanı pasifleştirir → çalışanın telefonu yerel veriyi siler, eşitleme 403 döner.

## Maliyet çalışana gitmez (K-120)
- Otomatik: `lib/auth/permissions.test.ts` (satın alma / rapor izni maliyeti kapsar, veri kapsamı, 029'daki kuralın ve tablo listesinin uygulamayla aynı olması), `lib/sync/client.test.ts` (izin değişince baştan indirme kararı). `npm run test:e2e` artık eşitlemeyi ve kayıt okumayı 029 fonksiyonlarıyla yapar (029 uygulanmış olmalı).
- Elle (029 uygulandıktan sonra):
  1. Çalışan (yalnızca veresiye izni) uygulamayı açar → eşitleme baştan iner. Ürün ekranında alış fiyatı yok; Satın Almalar ve Tedarikçiler menüde yok.
  2. Çalışanın tarayıcı konsolunda `indexedDB` → `products` kayıtlarında `last_purchase_price` alanı yok; `purchases` tablosu boş.
  3. Çalışan stoklu bir ürünü satar → satış ve stok çıkışı patrona gelir (🔔 Bildirimler / "Eşitleme ve bildirimler" ekranında hata yok). Patronun satış detayında kâr, ürünün alış fiyatıyla hesaplanmış görünür.
  4. Patron çalışana "Alış fiyatı ve kârı görsün" iznini verir → çalışan uygulamayı yeniden açınca alış fiyatı görünür; izin kapatılınca yeniden kaybolur.
  5. Patronun kendi telefonunda her şey eskisi gibi: ürün düzenleme, alış faturası, çakışma çözümü.

## Çalışanın yaptıkları patrona bildirilir (K-121)
- Otomatik: `lib/notifications/staffActivity.test.ts` (hangi işlerin sayıldığı, patronun cihazlarının ayrılması, ilk çalışmada geçmişin bildirilmemesi, aynı işin bir kez bildirilmesi, çalışana gösterilmemesi).
- Elle (030 uygulandıktan sonra):
  1. Çalışan yeni müşteri ekler, servis açar, servisi teslim eder, satış yapar.
  2. Patron uygulamayı açar → 🔔 zilinde sayı çıkar; Bildirimler'de "Ahmet yeni müşteri ekledi: …", "Ahmet servis açtı: …" satırları var; satıra dokununca kayıt açılır.
  3. Patron Ayarlar → Çalışanlar → "Yaptıkları": aynı işler Bugün / Bu hafta / Tümü süzgeciyle listelenir.
  4. Çalışanın kendi zilinde bu bildirimler görünmez. Patronun kendi yaptıkları bildirim üretmez.
  5. Çalışan bir kritik stok bildirimine "Okundu" / "Çözüldü say" der → patronun zilinde aynı bildirim hâlâ okunmamış görünür (K-122; `lib/notifications/center.test.ts`).
