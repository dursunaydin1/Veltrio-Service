# Çalışma Kuralları (Kullanıcı İstekleri)

> Bu dosya, proje sahibinin Claude'dan kalıcı olarak istediği çalışma biçimini tutar. Her oturumun başında okunur; kullanıcının aynı şeyleri tekrar tekrar söylemesine gerek kalmaz. Yeni bir kalıcı istek geldiğinde buraya eklenir.

## İletişim
1. **Yanıtlar Türkçe.**
2. **Kısa ve net.** Gereksiz tekrar, uzun anlatım yok (kullanıcı token tüketimine dikkat ediyor).
3. **Adım adım ilerleme.** Kullanıcının bir işlem yapması gerekiyorsa tek seferde tek küçük, emin adım verilir; sonuç beklenir. Örnek değerler (e-posta, şifre vb.) kopyalanabilir biçimde verilir.
4. **Ne yapıldığı anlatılır.** Her adımın sonunda: ne yapıldı, hangi dosyalar, neden, gerekirse nasıl geri alınır. Amaç: kullanıcı projeye hâkim olsun ve gerektiğinde kendisi müdahale edebilsin.
12. **Onaydan önce Türkçe açıklama** (2026-11-10): Sahip onay ekranındaki İngilizce komutları anlamıyor. Onay isteyen her işlemden (komut, dosya yazma, push) önce ne yapılacağı tek kısa Türkçe cümleyle söylenir.
13. **Onaysız silme yok** (2026-11-10): Sahip açıkça "sil" demeden bilgisayardan / depodan hiçbir şey silinmez (dosya, dal, kayıt; `git clean`, `git reset --hard`, zorla push dahil).

## Kaynaklar
5. Gereksinimler `PRD.md` ve `docs/` altındadır.
6. Gizli bilgiler (anahtarlar, şifreler) sohbete yazılmaz; `.env.local` git'e gitmez.

## Doküman ve plan
7. **Planlar kutsal değildir.** Dokümanda eksik, yanlış veya projenin ilerleyişine uymayan bir şey bulunursa Claude bunu ihtiyaca göre düzeltir, gerekirse yeni çözüm önerir ve projeyi buna göre kurar.
8. **Her sapma kaydedilir:** [KARAR_GUNLUGU.md](./KARAR_GUNLUGU.md) dosyasına "ne değişti, neden, sonuç" yazılır.
9. **Yapılanlar dokümana işlenir:** İlgili faz dosyasındaki kutucuklar işaretlenir; eksik kalan kısım açıkça yazılır. `00_GENEL_PLAN.md` ilerleme tablosu güncel tutulur.

## Git
10. Anlamlı bir adım tamamlandıkça (testler ve tip kontrolü geçtikten sonra) uygun bir commit mesajıyla (`feat(phase-1): ...`, `docs: ...`, `chore: ...`) commit atılır ve **GitHub'a push edilir**. Commit mesajları **İngilizce** yazılır (kod içi metinler ve dokümanlar Türkçe kalır).
11. Kullanıcıya neyin gönderildiği kısaca söylenir.
20. **main'e push = telefona canlı yayın** (2026-11-01): Uygulama https://veltrio-service.vercel.app adresinde (demo Supabase projesi) yayında; sahip telefonuna PWA olarak kurdu. main'e her push birkaç dakikada telefona gider. Riskli değişiklikten önce `npm run build` düzeyinde denetim yapılır. Önbelleğe alınan dosyalar değişince `public/sw.js` içindeki `VERSION` artırılır. Canlı ortam (ayrı Supabase projesi, alan adı, Play Store) sahip isteyince yapılır.
21. **Birden çok oturum aynı depoda çalışabilir** (2026-11-07): sahip hem bilgisayardan hem telefondaki Claude'dan (Claude Code bulut oturumu) iş isteyebilir. Push etmeden önce `git pull --rebase` yapılır; çakışma varsa ötekinin işi korunarak birleştirilir.
25. **Önce SQL, sonra yayın** (2026-11-11): Yeni migration'ı uygulama kodu kullanıyorsa kod önce ayrı dala gönderilir; sahip SQL'i Supabase SQL Editor'da çalıştırıp "tamam" deyince main'e birleştirilir. Sırası ters olursa telefondaki kayıtlar sunucuya gönderilemez.

## Testler
22. **Testler iş grubunun sonunda bir kez** (2026-10-30, üç kez tekrarlandı): Sahip testleri beklemenin vakit kaybı olduğunu söyledi. Küçük arayüz / metin / stil değişikliklerinde yerelde test koşulmaz; `npx tsc --noEmit` ve değişen dosyalarda eslint yeterlidir, sonra doğrudan commit + push. GitHub Actions her push'ta `check:full` çalıştırır, Vercel derlemesi tür denetimi yapar; hata yayını durdurur, telefon çalışan sürümde kalır. Yalnızca ciddi mantık değişikliklerinde (eşitleme, para, stok, belge işlemleri) ilgili test dosyası çalıştırılır (`npx vitest run <dosya>`). `check:full` yerelde yalnızca sahip isterse ya da büyük bir iş grubunun sonunda çalıştırılır. Hız, özensizlik demek değildir: dikkatli ve özenli çalışılır.

## Şu anki aşama
23. **Gerçek kullanım dönemi** (2026-11-06'dan itibaren, yaklaşık 2 hafta): Örnek verili senaryo denemeleri bitti. Sahip demo yayına gerçek iş kayıtları giriyor; gördüğü sorunları ekran görüntüsüyle bildirir, her istek tek tek düzeltilir. Yeni senaryo listesi önerilmez; bu dönemde canlıya geçiş gündeme getirilmez.
24. **Canlıya geçmeden önce tek seferlik temizlik** (sahip "temizleyelim" deyince): demo ve hatalı kayıtlar silinir, gerçek kayıtlar kalır. Ayrım ölçütü ilk gerçek kaydın tarihidir; hatalı kayıtlar iptal edilip notuna "SİL" yazılmıştır. Sıra: yedek al → silinecek listesini sahibe onaylat → tek seferlik SQL (SQL Editor; `stock_movements` / `audit_logs` kuralları geçici kaldırılıp geri konur, 027 politikaları SQL Editor'u etkilemez) → telefondaki yerel veriyi sıfırlayıp yeniden indir → karar günlüğüne yaz.

## Tasarım tercihleri
14. **Koyu lacivert tema (varsayılan; açık tema seçilebilir, K-116), pirinç vurgu, gece mavisi logo** (kırmızı yalnızca gecikme/sorunda, turuncu uyarıda, yeşil tamamda) (2026-10-28'de lacivert palet seçildi, K-046; 2026-10-30'da hazır SaaS mavisi sıradan bulunduğu için vurgu pirince alındı, K-051). Logo: kıvrımlı onay işareti, pirinç halka; yazı "Veltrio" iri, "SERVICE" küçük ve harf aralıklı. Parlama ve gradyan efektlerinden kaçınılır; renkler düz kullanılır. Ekranlar sade tutulur, her zaman görünen bilgiler azaltılır; ayrıntı ilgili sayfaya konur.
15. **İsteğe bağlı alanlar "+ çip" olarak durur** (2026-11-04, K-086): not, açıklama, adres, bugünden farklı tarih, indirim, vade gibi boş bırakılabilen alanlar `OptionalField` ile kapalı gelir; dokununca açılır, X ile kapanır ve silinir. Varsayılanı olan ayarlar (ör. KDV) özet çip olarak görünür. Zorunlu ve sık kullanılan alanlar açık kalır. Ayarlar ekranları bu kuralın dışındadır. Kaydedince sayfada kalınmaz, akış sıradaki ekrana / sekmeye geçer. Her yeni ya da değişen formda kendiliğinden uygulanır.
16. **Tasarım kuralları yazılıdır** (2026-11-07, K-112 – K-116): renk anlamları, yazı ve boşluk ölçeği, kontrol seçimi (anahtar / çip / aramalı seçici), ekran iskeleti ve tema [TASARIM_KURALLARI.md](./TASARIM_KURALLARI.md) dosyasındadır. Yeni ekranda satır içi stil (`style={{…}}`) yalnızca çalışma anında hesaplanan değer için kullanılır; varsayılan koyu tema, açık tema Ayarlar → Görünüm'den seçilir.

## Teknik tercihler (kullanıcı onaylı)
12. Para tutarları veritabanında `DECIMAL(15,4)`, kodda **kuruş cinsinden tam sayı** (`src/lib/calc.ts`).
13. Şema değişiklikleri, ihtiyaç duyan özellikten hemen önce ayrı migration olarak yapılır (bkz. karar günlüğü).
