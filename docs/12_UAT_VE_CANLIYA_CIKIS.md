# Kullanıcı Kabul Testi ve Canlıya Çıkış (Adım 7.7, 7.9)

## 1. UAT planı (işletme sahibiyle)

**Hazırlık:** Ayrı bir deneme işletmesi veya demo veri; gerçek müşteri verisi girmeden önce. Süre: 2-3 gün gerçek kullanım + 1 saat değerlendirme.

| # | Senaryo | Beklenen | Sonuç | Not |
|---|---|---|---|---|
| 1 | Müşteri ve makine kaydı, servis açma (≤ 30 sn mevcut müşteride) | Kabul fişi yazdırılıyor | ☐ | |
| 2 | Teşhis, teklif, müşteri onayı, parça kullanımı | Stok düşüyor, onay kaydı var | ☐ | |
| 3 | Servis tamamlama, kısmi tahsilat, borçlu teslim | Kalan bakiye gösteriliyor, bakiye doğru | ☐ | |
| 4 | Hızlı satış (peşin) ve veresiye satış | Stok düşüyor, veresiye bakiyeye yazılıyor | ☐ | |
| 5 | Makine satışı (seri numaralı) | Birim düşüyor, makine müşteriye bağlanıyor | ☐ | |
| 6 | Satın alma, tedarikçi ödemesi | Stok artıyor, tedarikçi borcu doğru | ☐ | |
| 7 | Stok düzeltme (neden zorunlu), hasarlı stok | Geçmişte görünüyor | ☐ | |
| 8 | İade ve satış iptali | Ters kayıt, bakiye doğru | ☐ | |
| 9 | İnternet kapalıyken çalışma, sonra eşitleme | Kayıt kaybı yok | ☐ | |
| 10 | Raporlar: satış, tahsilat, bakiyeler; Excel'e aktarma | Rakamlar defterle uyuşuyor | ☐ | |
| 11 | Ürün/müşteri listesini içe aktarma | Hatalar açıkça listeleniyor | ☐ | |
| 12 | QR etiketi basma ve okutma | Doğru makine/ürün açılıyor | ☐ | |

**Geri bildirim:** her satıra “anlaşıldı mı / kaç adımda / takıldığın yer” notu; kritik UX sorunları düzeltme listesine alınır (dosyaya tarih ve sürümle).

**UAT sonucu:** ☐ Kabul ☐ Koşullu kabul (liste) ☐ Ret — Tarih / imza: ______

## 2. Canlıya çıkış kontrol listesi (PRD §22)

Durum: ✅ otomatik kanıt var · 🖐 elle yapılacak · ⚖ hukuk danışmanı

| Madde | Durum | Kanıt / yapılacak |
|---|---|---|
| Business/User/Device izolasyonu ve yetkisiz erişim | ✅ | e2e 7i, `docs/11` |
| Müşteri/makine, mükerrer uyarısı, arşivleme, makine geçmişi | ✅ | AC-018, 029, 030, 051 |
| Servis durumları, onay eşiği/tutarı, garanti, kapora, servis sayacı | ✅ | AC-004, 017, 033, 042 |
| ServicePart, stok hareketi, negatif/hasarlı stok, çevrimdışı çakışma | ✅ | AC-006..009, 043 |
| Seri takipli makine satışı, satın alma/iade | ✅ | AC-013, 027, 039 |
| Veresiye/tahsilat ayrımı, tahsis, iade, iptal, bakiyeler | ✅ | AC-010..014, 040, 044, 046 |
| Açılış stok/bakiye içe aktarma; çift yükleme önleme | ✅ | AC-015, 047 |
| Eşitleme idempotency, hata kuyruğu, çok cihaz, toplam uyuşmazlığı | ✅ | AC-009, 026, 036, 037 |
| Yedekten geri yükleme tatbikatı; RPO/RTO | 🖐 | `docs/11` §2 (bir kez gerçek projede yapılmalı; cron + gizli anahtarlar tanımlanmalı) |
| PIN, hesap kurtarma, cihaz iptali, dışa aktarma güvenliği | 🖐 | `docs/09` M-3..M-5 |
| iOS/Android: QR, kamera, çevrimdışı, fotoğraf, yazdırma | 🖐 | `docs/10` cihaz test listesi |
| KVKK aydınlatma, saklama, veri lokasyonu | ⚖ | `docs/13_KVKK.md` (taslak; hukuk danışmanı onayı bekler) |
| Türkçe karakter, TL, tarih, CSV/XLSX, fişler | ✅/🖐 | `export.test.ts`; fiş yazdırma cihazda |
| Hata, çakışma, son yedek, bekleyen kayıt anlaşılır gösterim | ✅ | Bildirim merkezi, `SyncStatus` |
| Kritik işlem düzeltme geçmişi ve arşivleme | ✅ | Ayarlar → Geçmiş |
| MVP dışı özellikler sonraki sürüme ayrıldı | ✅ | aşağıda |
| UAT tamamlandı; kısıtlar ve kılavuz teslim edildi | 🖐 | bölüm 1 + `docs/KULLANIM_KILAVUZU.md` |

### Canlıya çıkıştan önce yapılacaklar (teknik)
1. Supabase'te `supabase/migrations` 001→024 uygulanmış olmalı (`npm run db:migrate -- --status`).
2. Supabase → Authentication: Site URL ve `/auth/callback` yönlendirmesi; şifre en az 10 karakter; e-posta doğrulama açık; kendi SMTP'niz (üretimde Supabase'in varsayılan e-postası sınırlıdır).
3. Barındırmada ortam değişkenleri: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
4. `npm run build` ve `npm test`, `npm run test:e2e` yeşil.
5. İlk gece yedeğinin `business_backups` tablosunda “Başarılı” göründüğünü doğrulayın.

### MVP dışı (sonraki sürüm)
Otomatik WhatsApp/SMS, telefon anlık bildirimi, çok kullanıcı/rol, e-fatura/e-arşiv entegrasyonu, banka mutabakatı, fotoğrafların nesne depolamaya taşınması, sunucu tarafı tam metin arama.
