# Güvenlik Denetimi ve Yedek Provası (Adım 7.2, 7.5)

## 1. Güvenlik denetimi

| Konu | Kontrol | Kanıt |
|---|---|---|
| Business izolasyonu (AC-019) | Her tabloda RLS politikası `business_id = current_business_id()`; başka işletme kaydı eklenemez, okunamaz | e2e 7i (gerçek Supabase) |
| Tahmin edilebilir kimlik | UUID v4 kimlikler; rastgele kimlikle sorgu boş döner | e2e 7i |
| API'de işletme kontrolü | `/api/sync/push|pull`: kullanıcı → işletme → aktif cihaz doğrulanır; yük `business_id` farklıysa reddedilir; iptal cihaz 403 | `sync/apply.test.ts`, `sync/server.ts` |
| QR yetkisiz erişim | QR yalnızca adres taşır; oturumsuz erişim girişe yönlenir, girişten sonra sayfaya dönülür; yalnızca uygulama içi `next` kabul edilir | `auth/redirect.test.ts`, `proxy.ts` |
| Dışa aktarma (AC-049) | Hassas veri uyarısı + PIN/şifre yeniden doğrulama + audit log | `ExportPanel` (elle: M-5) |
| PIN (AC-020) | PBKDF2-SHA-256 (150 bin yineleme) + tuz; 5 hatada 30 sn, sonra artan kilit; sayaç kalıcı | `pin/pin.test.ts` |
| Hesap kurtarma (AC-048) | E-posta ile sıfırlama; politika ≥10 karakter, harf+rakam | `auth/password.test.ts`; Supabase ayarı |
| Cihaz iptali (AC-045) | İptal geri alınamaz; bağlanınca yerel veri silinir; sunucu iptal cihazdan veri kabul etmez | `device/wipe.test.ts` |
| HTTPS/TLS | HSTS başlığı; Supabase ve barındırma HTTPS; `Permissions-Policy` yalnız kamera | `test/security.test.ts` |
| Çerçeveleme / MIME | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` | `test/security.test.ts` |
| Düz metin hassas veri | Şifre hiçbir yerde saklanmaz; PIN yalnızca özet olarak; oturum belirteci Supabase çerezinde (HttpOnly değil: SSR istemcisi); localStorage'da yalnızca kullanıcı/işletme/cihaz kimliği ve ayarlar | kod incelemesi (`stores/session.ts`) |
| Sunucu gizlileri | `SUPABASE_SERVICE_ROLE_KEY` yalnızca sunucu görevinde (`/api/cron/backup`), istemciye gitmez; `CRON_SECRET` ile korunur | `api/cron/backup/route.ts` |

### Bilinen riskler ve notlar
- **Fotoğraflar** yerel veritabanında ve sunucuda metin (data URL) olarak durur; cihaz çalınırsa erişilebilir → cihaz iptali ve PIN bu riski azaltır. Yüksek hacimde şifreli depolamaya taşınması düşünülebilir.
- **`xlsx` paketi** (0.18.5) bilinen açıklara sahiptir; yalnızca kullanıcının kendi dosyaları için ve 5 MB / 5.000 satır sınırıyla kullanılır.
- **Yedek dosyaları** (elle indirilen JSON) şifresizdir: dosyayı güvenli saklamak kullanıcı sorumluluğundadır (indirme öncesi uyarı gösterilir). Sunucu yedekleri özel depoda tutulur.

## 2. Yedekleme ve geri yükleme provası

**Sunucu yedeği (otomatik):** `/api/cron/backup` her gün 03:00'te (vercel.json) tüm işletmeleri `backups/<işletme>/<tarih>.json` olarak yazar, `business_backups` tablosuna durum atar, son 30 yedeği tutar. **RPO ≤ 24 saat.** Kurulum: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (supabase/README.md). Depo özeldir (public değil); Supabase depolama diskte şifreler.

**Prova senaryosu (yılda en az bir kez ve canlıya çıkıştan önce):**
1. Ayarlar → Yedekleme: **Yedek al ve indir**; “Son yedek” zamanının güncellendiğini görün.
2. Başka bir tarayıcıda (veya veri silinmiş cihazda) giriş yapın; veriler sunucudan inmeli (yeni cihaz = geri yükleme yolu 1; **RTO ≈ dakikalar**).
3. Sunucu verisi bozulmuşsa: yedek dosyasını **Yedekten geri yükle** ile yükleyin → özet (tarih, cihaz, kayıt sayısı) ve kritik onay → otomatik “geri yükleme öncesi” ek yedek indirilir → eklenen/atlanan sayısı gösterilir → eksik kayıtlar sunucuya gönderilir (kopya oluşmaz).
4. Audit log'da “Yedekten geri yükleme” kaydını doğrulayın.
5. Gerçek sunucu verisi tamamen kaybolursa: Supabase proje yedeği (plan dahilinde) veya `backups` deposundaki en son JSON ile yukarıdaki geri yükleme; **RTO hedefi ≤ 1 iş günü**.

**Otomatik kanıt:** `backup/backup.test.ts` (alma, doğrulama, ekleyici geri yükleme, iki kez yüklemede kopya yok), `backup/server.test.ts` (sunucu yedeği, sayfalama, 30 yedek temizliği, hata kaydı), e2e 7j (gerçek sunucuda yedekten geri yükleme sayıları değiştirmez).
