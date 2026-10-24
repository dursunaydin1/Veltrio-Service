# Kabul Kriterleri Eşleştirmesi (AC-001 → AC-051)

Her kabul kriteri için kanıt: **otomatik** (birim/akış testi ya da gerçek Supabase'e karşı `npm run test:e2e`) veya **manuel** (cihazda elle doğrulanması gereken; adımları aşağıda). Otomatik testlerin son durumu: `npm test` ve `npm run test:e2e` yeşil olmalıdır.

Durum: ✅ otomatik kanıt var · 🟡 otomatik + cihazda elle doğrulama gerekir · 🖐 yalnızca elle doğrulanır

| AC | Konu | Kanıt | Durum |
|---|---|---|---|
| AC-001 | Servis UUID ve belge numarası | `services/services.test.ts`, `numbering.test.ts` | ✅ |
| AC-002 | Yeni müşteri + makine ile servis; fotoğraf/seri zorunlu değil | `services.test.ts` (geçici makine), `machines.test.ts` | ✅ |
| AC-003 | Makine QR → makine/sahip/geçmiş; oturumsuzsa önce giriş | `qr/payload.test.ts`, `auth/redirect.test.ts`; kamerayla okuma | 🟡 (M-1) |
| AC-004 | Onaysız kalem toplama girmez; fiyat artınca eski onay geçersiz | `services/quote.test.ts`, `lines.test.ts` | ✅ |
| AC-005 | Şablon kopyası değişmez | `catalog/catalog.test.ts`; e2e 7g | ✅ |
| AC-006 | Müşteri parçası stok hareketi üretmez | `quote.test.ts` | ✅ |
| AC-007 | Kullanımda snapshot + stok hareketi | `quote.test.ts`, `delivery.test.ts` | ✅ |
| AC-008 | Sıfır stokta satış/tüketim engeli; istisna ayarında gerekçe | `stock/stock.test.ts`, `sales/sales.test.ts` | ✅ |
| AC-009 | İki cihaz son stoğu tüketir: hareket silinmez, çakışma bildirimi | `test/multidevice.test.ts`, `notifications/stockAlerts.test.ts`; arayüz notu `OfflineStockNotice` | 🟡 (M-2) |
| AC-010 | Veresiye tahsilat raporuna girmez | `reports/load.test.ts`, `sales.test.ts` | ✅ |
| AC-011 | Kısmi ödeme: toplam/tahsil/kalan | `sales.test.ts`, `finance/openItems.test.ts`; e2e 4 | ✅ |
| AC-012 | Müşteri iadesi: kısmi, para/alacak, stok durumu | `returns/returns.test.ts`; e2e 7c | ✅ |
| AC-013 | Tedarikçi iadesi satıra bağlı; stok + bakiye | `returns/purchase.test.ts`; e2e 7d | ✅ |
| AC-014 | Servis iptali/ücret iadesi ters hareket | `returns/service-return.test.ts`; e2e 7e | ✅ |
| AC-015 | Açılış stok/bakiye içe aktarma; aynı batch ikinci kez uygulanmaz | `import/import.test.ts` | ✅ |
| AC-016 | UUID + cihaz kodlu numara; çakışmada eski numara denetimde | `sync/apply.test.ts` (yeniden numaralama), `numbering.test.ts` | ✅ |
| AC-017 | Durum geçmişi; yeniden açma sayacı artırmaz | `services/status.test.ts`, `delivery.test.ts`, `reports/load.test.ts` | ✅ |
| AC-018 | Makine sahipliği geçmişi | `machines/machines.test.ts` | ✅ |
| AC-019 | Başka işletme kaydı okunamaz/değiştirilemez | e2e 7i (RLS, tahmin edilen kimlik), `sync/apply.test.ts` | ✅ |
| AC-020 | PIN 5 hatada kilit; hesap kurtarma başlar | `pin/pin.test.ts`; kurtarma e-postası | 🟡 (M-3) |
| AC-021 | Fotoğraf ≤ ~2 MB; çevrimdışı kuyruk | `images/resize.test.ts` (1600 px, üst sınır), kuyruk `sync/queue.test.ts`; kamerayla çekim | 🟡 (M-1) |
| AC-022 | Çevrimdışı arama + kapsam uyarısı | `search/globalSearch.test.ts`; uyarı metni arayüzde | ✅ |
| AC-023 | Satış/tahsilat/servis geliri ayrı; iade-iptal net düşer | `reports/calc.test.ts`, `reports/load.test.ts` | ✅ |
| AC-024 | XLSX/CSV Türkçe karakter ve biçim | `export/export.test.ts` | ✅ |
| AC-025 | Borçlu teslimde kalan bakiye + kayıt | `services/delivery.test.ts` | ✅ |
| AC-026 | Toplamlar ortak modülle doğrulanır; uyuşmazlık sessizce değişmez | `sync/verify.test.ts`, `test/multidevice.test.ts`, `calc.test.ts` | ✅ |
| AC-027 | Makine satışı birimi düşer, makineyi müşteriye bağlar | `sales/cancel.test.ts`, `serial/serial.test.ts`; e2e 7 | ✅ |
| AC-028 | Kritik stok bildirimi tekrarsız | `notifications/stockAlerts.test.ts` | ✅ |
| AC-029 | Telefon/seri mükerrer uyarısı | `customers.test.ts`, `machines.test.ts`, `import.test.ts` | ✅ |
| AC-030 | Arşiv: listeden ve aramadan kalkar; bakiye/açık servis engeller | `customers.test.ts`, `search/globalSearch.test.ts` | ✅ |
| AC-031 | Stok düzeltmesi geçmişi; nedensiz kaydedilmez | `stock/stock.test.ts` | ✅ |
| AC-032 | Kritik düzeltme eski/yeni değer, aktör, gerekçe | `audit/describe.test.ts`, `sync/audit.test.ts`; Ayarlar → Geçmiş | ✅ |
| AC-033 | İptal sayaç; teslim edilen iptal edilemez | `status.test.ts`, `delivery.test.ts`, `warranty.test.ts` | ✅ |
| AC-034 | Fiş alanları; maliyet görünmez | `services/receipt.test.ts` | ✅ |
| AC-035 | Ürün QR güncel veri gösterir | `qr/payload.test.ts` (QR yalnızca adres); ürün sayfası canlı veri | 🟡 (M-1) |
| AC-036 | Aynı paket ikinci kayıt oluşturmaz | `sync/apply.test.ts`, `test/multidevice.test.ts`; e2e 6 | ✅ |
| AC-037 | Hata kaydı silmez, kuyrukta kalır, kullanıcı görür | `sync/queue.test.ts`, `test/multidevice.test.ts`, `notifications/center.test.ts` | ✅ |
| AC-038 | Onay/teslim/vade hatırlatması tekrarsız | `notifications/serviceReminders.test.ts`, `paymentDue.test.ts` | ✅ |
| AC-039 | Seri birim çift satış engeli; çevrimdışı çakışma kuyruğu | e2e 7 (sürüm çakışması), `serial.test.ts`, `sync/conflicts` (`center.test.ts`) | ✅ |
| AC-040 | Genel tahsilat FIFO tahsis; avans | `finance/openItems.test.ts`, `aging.test.ts`; e2e 7f | ✅ |
| AC-041 | Müşterisiz veresiye engeli | `sales/sales.test.ts` | ✅ |
| AC-042 | Eşik aşımında onaysız “İşlemde” engeli | `quote.test.ts`, `status.test.ts` | ✅ |
| AC-043 | DAMAGED iade satılabilir stoğa girmez | `returns/returns.test.ts` | ✅ |
| AC-044 | Satış iptali ters stok/ödeme; iadeden ayrı | `sales/cancel.test.ts`, `reports/load.test.ts`; e2e 7b | ✅ |
| AC-045 | İptal edilen cihaz yerel veriyi siler; sonradan gelen kayıtlar reddedilir | `device/wipe.test.ts`; sunucu 403 reddi (`sync/server.ts`) | 🟡 (M-4) |
| AC-046 | Alacak → negatif bakiye; yaşlandırma yalnız borç | `finance/openItems.test.ts`, `aging.test.ts` | ✅ |
| AC-047 | Aynı dosya özeti ikinci kez uygulanmaz | `import/import.test.ts`; sunucu `UNIQUE (business_id, file_hash)` | ✅ |
| AC-048 | E-postayla hesap kurtarma; e-postasız kurulumda uyarı | `auth/password.test.ts`; Supabase e-posta ayarı | 🟡 (M-3) |
| AC-049 | Dışa aktarma kimlik ister, hassas veri uyarısı | `ExportPanel` (PIN/şifre + onay kutusu + audit) | 🖐 (M-5) |
| AC-050 | Maliyet snapshot'ı sonradan değişmez | `stock.test.ts`, `sales.test.ts`, `warranty.test.ts` | ✅ |
| AC-051 | Geçici makine birleştirme; servisler taşınır; audit | `machines/merge.test.ts`; e2e 7h | ✅ |

## Elle doğrulama adımları

- **M-1 (kamera / QR / fotoğraf, AC-003, 021, 035):** Telefonda uygulamayı açın → bir makine için **QR etiketi göster** → ekrandaki QR'ı ikinci cihazla **QR Tara**'dan okutun: makine sayfası açılmalı. Oturumu kapatıp aynı adresi açın: giriş istenmeli, girişten sonra aynı makine açılmalı. Ürün için aynısını yapın; ürünün fiyatını değiştirip QR'ı tekrar okutun: yeni fiyat görünmeli. Servis kabulünde fotoğraf çekin: yüklenip küçültüldüğünü ve internet kapalıyken de kaydedildiğini doğrulayın.
- **M-2 (AC-009):** İki cihazda aynı son ürünü çevrimdışı satın; internete bağlayın: ürün “Eksi stok” olmalı, **Bildirimler** merkezinde çakışma bildirimi görünmeli.
- **M-3 (AC-020, 048):** 5 kez yanlış PIN: 30 sn kilit. Giriş ekranında **Şifremi unuttum**: e-posta gelmeli, bağlantı yeni şifre ekranını açmalı. (Supabase'te Site URL ve `/auth/callback` yönlendirmesi tanımlı olmalı.)
- **M-4 (AC-045):** Ayarlar → Cihazlar'dan ikinci cihazı iptal edin; o cihazı internete bağlayın: verisi silinmeli ve giriş ekranına dönmeli; panelde “Yerel veri silindi” yazmalı.
- **M-5 (AC-049):** Raporlar → Dışa aktar: dosya indirmeden önce uyarı onayı ve PIN/şifre istenmeli; indirilen CSV'yi Excel'de açıp Türkçe karakterleri kontrol edin.
