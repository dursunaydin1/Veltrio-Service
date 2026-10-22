# Çalışma Kuralları (Kullanıcı İstekleri)

> Bu dosya, proje sahibinin Claude'dan kalıcı olarak istediği çalışma biçimini tutar. Her oturumun başında okunur; kullanıcının aynı şeyleri tekrar tekrar söylemesine gerek kalmaz. Yeni bir kalıcı istek geldiğinde buraya eklenir.

## İletişim
1. **Yanıtlar Türkçe.**
2. **Kısa ve net.** Gereksiz tekrar, uzun anlatım yok (kullanıcı token tüketimine dikkat ediyor).
3. **Adım adım ilerleme.** Kullanıcının bir işlem yapması gerekiyorsa tek seferde tek küçük, emin adım verilir; sonuç beklenir. Örnek değerler (e-posta, şifre vb.) kopyalanabilir biçimde verilir.
4. **Ne yapıldığı anlatılır.** Her adımın sonunda: ne yapıldı, hangi dosyalar, neden, gerekirse nasıl geri alınır. Amaç: kullanıcı projeye hâkim olsun ve gerektiğinde kendisi müdahale edebilsin.

## Kaynaklar
5. Gereksinimler `PRD.md` ve `docs/` altındadır.
6. Gizli bilgiler (anahtarlar, şifreler) sohbete yazılmaz; `.env.local` git'e gitmez.

## Doküman ve plan
7. **Planlar kutsal değildir.** Dokümanda eksik, yanlış veya projenin ilerleyişine uymayan bir şey bulunursa Claude bunu ihtiyaca göre düzeltir, gerekirse yeni çözüm önerir ve projeyi buna göre kurar.
8. **Her sapma kaydedilir:** [KARAR_GUNLUGU.md](./KARAR_GUNLUGU.md) dosyasına "ne değişti, neden, sonuç" yazılır.
9. **Yapılanlar dokümana işlenir:** İlgili faz dosyasındaki kutucuklar işaretlenir; eksik kalan kısım açıkça yazılır. `00_GENEL_PLAN.md` ilerleme tablosu güncel tutulur.

## Git
10. Anlamlı bir adım tamamlandıkça (testler ve tip kontrolü geçtikten sonra) uygun bir commit mesajıyla (`feat(phase-1): ...`, `docs: ...`, `chore: ...`) commit atılır ve **GitHub'a push edilir**.
11. Kullanıcıya neyin gönderildiği kısaca söylenir.

## Teknik tercihler (kullanıcı onaylı)
12. Para tutarları veritabanında `DECIMAL(15,4)`, kodda **kuruş cinsinden tam sayı** (`src/lib/calc.ts`).
13. Şema değişiklikleri, ihtiyaç duyan özellikten hemen önce ayrı migration olarak yapılır (bkz. karar günlüğü).
