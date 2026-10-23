# QA / Otomatik Test Düzeneği

Amaç: Her adımdan sonra "proje sağlam mı?" sorusunu tarayıcıda elle denemeden, tek komutla yanıtlamak. Üç katman var:

| Katman | Komut | Ne doğrular | Sunucu verisi |
|---|---|---|---|
| 1. Tip denetimi | `npx tsc --noEmit` | Tip/yazım hataları | yok |
| 2. Birim + iş akışı testleri | `npm test` | İş kuralları, hesaplar, stok defteri, kuyruk, servis/alım/satış akışları (yerel Dexie taklidiyle) | yok |
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
