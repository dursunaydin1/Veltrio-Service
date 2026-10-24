# KVKK Hazırlık Belgesi (Adım 7.8) — TASLAK

> **Bu belge hukuki görüş değildir.** Teknik gerçekleri ve önerilen metinleri içerir; aydınlatma metni, saklama süreleri ve veri lokasyonu değerlendirmesi mutlaka bir **hukuk danışmanı** tarafından gözden geçirilip onaylanmalıdır. Onay alınmadan canlıya çıkış maddesi (docs/12) tamamlanmış sayılmaz.

## 1. Veri envanteri (uygulamanın gerçekten işlediği veri)

| Veri | Kimin | Nerede | Amaç | Not |
|---|---|---|---|---|
| Ad soyad, telefon, köy/adres, not | Müşteri | Cihaz + Supabase | Servis/satış/tahsilat ilişkisi, iletişim | T.C. kimlik no **istenmez** |
| Makine bilgisi (tür, marka, seri no) | Müşteri makinesi | Cihaz + Supabase | Servis geçmişi, garanti | |
| Müşteri / ürün / kabul fotoğrafı | Müşteri veya eşya | Cihaz + Supabase (metin olarak) | İsteğe bağlı; hasar/durum kanıtı | Kişi görüntüsü içerebilir |
| Bakiye, ödeme, satış, servis kayıtları | Müşteri | Cihaz + Supabase | Muhasebe, alacak takibi | Yasal saklama yükümlülükleri (VUK) olabilir |
| E-posta, şifre özeti | İşletme sahibi | Supabase Auth | Hesap ve kurtarma | Şifre düz metin tutulmaz |
| Cihaz adı/kodu, son eşitleme | İşletme sahibi | Supabase | Cihaz yönetimi, güvenlik | |
| Audit log (kim, ne zaman, ne değişti) | İşletme sahibi | Cihaz + Supabase | Denetim, hata düzeltme | Değiştirilemez |
| Hata günlükleri | — | Barındırma günlükleri | Hata ayıklama | Uygulama kişisel veri yazmaz (kontrol: günlüklerde müşteri adı/telefonu yok; yalnızca teknik mesajlar) |

## 2. Taslak aydınlatma metni (müşteriye gösterilecek / fişe eklenecek — hukukçu onayına sunulmalı)

> **[İşletme adı]** olarak, servis ve satış hizmetlerinin yürütülmesi, tahsilat ve garanti süreçlerinin takibi ve yasal yükümlülüklerin yerine getirilmesi amacıyla adınızı, telefon numaranızı, adresinizi ve makine bilgilerinizi işliyoruz. Veriler sözleşmenin ifası ve meşru menfaatimiz ile hukuki yükümlülüklerimiz kapsamında işlenir; yasal saklama süresi boyunca saklanır ve üçüncü kişilerle yalnızca hizmet sağlayıcılarımız (barındırma / veri tabanı) ve yasal zorunluluk hâlinde paylaşılır. KVKK m.11 uyarınca verilerinize erişme, düzeltme, silme ve itiraz haklarınızı **[iletişim]** adresine başvurarak kullanabilirsiniz.

## 3. İşleme amacı, hukuki sebep, saklama (öneri — onay gerekir)

| Veri | Hukuki sebep (öneri) | Saklama (öneri) |
|---|---|---|
| Müşteri iletişim ve makine bilgisi | Sözleşmenin ifası, meşru menfaat | İlişki sürdükçe + 10 yıl (ticari defter/garanti) |
| Mali kayıtlar | Hukuki yükümlülük (VUK/TTK) | 10 yıl |
| Fotoğraflar | Açık rıza veya meşru menfaat | Servis kapanışından 2 yıl; talep hâlinde silinir |
| Audit log | Meşru menfaat, hukuki yükümlülük | 10 yıl |

Uygulama kayıtları **silmek yerine arşivler** (mali bütünlük için). Veri sahibi silme talebinde: kişisel alanlar (ad, telefon, adres, fotoğraf) anonimleştirilir, mali kayıtlar yasal süre boyunca anonim olarak korunur. *(Anonimleştirme ekranı sonraki sürümde; şimdilik destek talebi üzerine Supabase'ten yapılır.)*

## 4. Veri sahibi başvuru süreci (öneri)
1. Başvuru yazılı/e-posta ile alınır, kimlik doğrulanır, kayda geçirilir (30 gün içinde yanıt).
2. Erişim talebi: müşterinin kayıtları Dışa aktar (CSV/Excel) ile verilir.
3. Düzeltme: müşteri kartı düzenlenir (audit log'a yazılır).
4. Silme: yukarıdaki anonimleştirme; yasal saklama gerektiren kayıt gerekçesiyle bildirilir.

## 5. Fotoğraf politikası
Fotoğraf isteğe bağlıdır; yalnızca makine/hasar durumunu göstermek için çekilir, kişi yüzü çekilmez. Fotoğraf 1600 px'e küçültülür ve ilgili kayda bağlı tutulur; müşteri fotoğrafı yalnızca müşterinin bilgisiyle eklenir.

## 6. Hizmet sağlayıcı ve veri lokasyonu
Veriler **Supabase** (PostgreSQL + Auth + Storage) üzerinde tutulur. Proje bölgesi (Frankfurt/EU vb.) panelden kontrol edilmeli ve yurt dışına aktarım KVKK m.9 kapsamında hukukçuyla değerlendirilmelidir (açık rıza veya yeterli koruma/taahhüt). Barındırma sağlayıcısı (ör. Vercel) için de aynı değerlendirme yapılmalıdır. Sağlayıcı sözleşmeleri (DPA) saklanmalıdır.

## 7. Teknik tedbirler (özet)
İşletme bazlı satır düzeyi güvenlik (RLS), HTTPS/HSTS, PIN ve cihaz iptali + uzaktan yerel veri silme, şifre politikası, dışa aktarmada yeniden doğrulama ve uyarı, değiştirilemez audit log, günlük şifreli sunucu yedeği (özel depo). Ayrıntı: `docs/11_GUVENLIK_VE_YEDEK.md`.
