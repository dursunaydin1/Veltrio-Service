# Karar Günlüğü

> Plandan (docs/00–07) veya PRD'den sapmaların, düzeltmelerin ve yeni çözümlerin kaydı. Yeni kayıtlar en üste eklenir.
> Biçim: **Ne değişti → Neden → Sonuç / etkilenen dosyalar**

## 2026-10-22

### K-012 · Nötr koyu gri tema; eşitleme göstergesi sakin
- **Geri bildirim:** Lacivert/mavi koyu tema amatör görünüyor; "Eşitlendi 12:40" yazısı her zaman görünmesin.
- **Tema:** Arka planlar nötr koyu griye çekildi (`#141414` zemin, `#1c1c1e` yüzey, `#242426` yükseltilmiş); metin ve kenarlık renkleri nötrleştirildi. Giriş ekranındaki mavi parlama, logo gradyanı ve gradyanlı başlık kaldırıldı. Vurgu rengi **turuncu** (`--accent-primary: #f97316`, hover `#ea580c`, açık `#fb923c`); düğme ve seçili sekme bununla boyanır. Turuncu zeminde beyaz yazı okunmadığı için birincil düğme, seçili metin ve atlama bağlantısı koyu yazı (`--text-inverse`) kullanır (kontrast ≥ 6:1). Renk tek yerde (`globals.css` tokenları) tanımlı; `badge-blue` sınıfı `badge-accent` oldu.
- **Gösterge:** Plan "her zaman görünür: bekleyen sayı, son eşitleme" diyordu. Her şey yolundayken yalnızca küçük simge görünür (ekran okuyucu metni ve ipucu duruyor); bekleyen, sorun ve çevrimdışı durumda metin çıkar. Son eşitleme zamanı Menü sayfasında.
- **Etki:** `globals.css`, `SyncStatus.tsx`, `LastSyncInfo.tsx`, giriş sayfası, `manifest.json`.

### K-011 · Henüz yapılmamış bölümler 404 yerine "yakında" sayfası gösterir
- **Sorun:** Alt menü ve hızlı eylemler olmayan sayfalara gidiyordu (404).
- **Karar:** Her bölüm için ilgili fazı belirten `ComingSoon` sayfası kondu; sayfa gerçekleştiğinde dosya ezilecek. İkincil menüye plandaki öğelere ek olarak "Satın Almalar" eklendi (satın alma için ayrı giriş gerekiyor). Ara ve QR Tara hızlı eylemleri hazır olana kadar devre dışı.
- **Etki:** `src/app/(app)/*/page.tsx`, `src/components/layout/*`.

### K-010 · Push: ekleme idempotent, güncelleme sürüm kontrollü
- **Sorun:** Push API her işlemi `upsert` ile uyguluyordu. İki cihaz aynı kaydı değiştirirse sondaki ötekini sessizce eziyordu; ayrıca ağ hatasıyla yeniden denenen eski bir "ekleme", arada güncellenmiş kaydı eski hâline döndürebiliyordu.
- **Karar:** INSERT yalnızca ekler (kayıt zaten varsa başarı sayılır, ezmez). UPDATE yalnızca `payload.version` sunucudakiyle eşitse uygulanır; değilse `CONFLICT` döner ve kayıt kuyrukta bekler. DELETE koşulsuz kalır (silme yerine `archived_at` tercih edilir).
- **Not:** Pull sırasında yerel kayıt sunucudakiyle değiştirilir; çakışan yerel düzenleme kuyruktaki `payload`'da saklı kalır, çözüm ekranı sonra yazılacak.
- **Etki:** `src/lib/sync/apply.ts` (yeni), `push/route.ts`, `client.ts`, `queue.ts` (`markConflict` mesaj alır).

### K-009 · `sync_state` yalnızca istemcide, `version` hem istemcide hem sunucuda
- **Plan:** Her kayıtta `version` ve `sync_state` alanı (Adım 1.2, 1.7).
- **Sorun:** `sync_state` (`PENDING_SYNC | SYNCED | CONFLICT | ERROR`) sunucuda anlamsız: sunucudaki her kayıt zaten eşitlenmiştir. Sütun eklemek yer kaplar, kimse okumaz.
- **Karar:** `version` sunucuda tutulur (UPDATE'te tetikleyici +1 artırır, çakışma tespitinde kullanılır). Eşitleme durumu zaten `sync_queue` tablosunda (`PENDING/SYNCED/ERROR/CONFLICT`) izlenir; kayıt başına ayrı `sync_state` yerel kayıtta isteğe bağlı kalır.
- **Etki:** `supabase/migrations/006_versioning_and_audit_sync.sql`.

### K-008 · Şema değişiklikleri "tam zamanında" yapılır
- **Plan:** Faz 2–7 tablolarının tamamı baştan, tam alan listesiyle kurulacak gibi yazılmış.
- **Sorun:** Alanlar (ör. `bucket`, `quantity_before/after`, ürün fotoğrafı) o özellik yazılırken netleşiyor; baştan eklemek tahmine dayalı ve sonradan değiştirilmesi gerekebilir.
- **Karar:** Kesen konular (versiyon, audit eşitleme, ayarlar) hemen yapılır. Özelliğe özgü alanlar, o özellikten hemen önce kendi migration'ında eklenir (007, 008…).

### K-007 · `audit_logs` artık sunucuya eşitleniyor
- **Sorun:** `audit_logs` `SYNC_TABLES` listesinde yoktu; denetim kayıtları yalnızca cihazda kalıyordu (AC-032 sağlanmıyordu).
- **Karar:** Tablo eşitlenen tablolara ve yalnızca-ekleme (append-only) listesine eklenir; `actor_id` ve `reason` alanları eklenir.
- **Etki:** migration 006, `src/lib/sync/tables.ts`.

### K-006 · İşletme ayarlarının varsayılanları plana uyduruldu
- **Plan:** `approval_threshold` 1.000 ₺, `allow_negative_stock` false, `delivery_reminder_days` 1, `max_offline_days` 30 (Adım 1.4).
- **Durum:** Şemada onay eşiği 0 idi, `allow_negative_stock` ve `max_offline_days` yoktu. Ayrı `BusinessSettings` tablosu yerine mevcut `businesses.settings` (JSONB) kullanılmaya devam ediliyor (tek kullanıcılı sistem için yeterli, eşitleme basit).

### K-005 · Belge numarası: cihaz kodu içeren kalıcı sayaç
- **Karar:** `S-/SAT-/AL-/IAD-[cihaz]-[yıl]-[sıra]`, `MK-/SB-[cihaz]-[sıra]`. Sayaç Dexie `counters` tablosunda (şema v2), artış tek işlemde.
- **Not:** Eski `SRV-` öneki plana göre `S-` yapıldı. Tarayıcı verisi silinirse sayaç sıfırlanır; çakışmayı sunucudaki `UNIQUE (business_id, document_no)` yakalar.
- **Etki:** `src/lib/numbering.ts`, `src/lib/utils/id.ts`.

### K-004 · Para: kuruş cinsinden tam sayı
- **Plan:** "Decimal, yuvarlama" (Adım 1.9). Mevcut kod `number` (float) ile hesaplıyordu.
- **Karar:** Veritabanı `DECIMAL(15,4)`; kodda tüm hesaplamalar kuruş tam sayısıyla. Girdi metin üzerinden okunur (1.005 → 101 kuruş).
- **Etki:** `src/lib/calc.ts`; `utils/currency.ts` içindeki float fonksiyonlar `@deprecated`.

## 2026-10-20

### K-003 · Next.js 16, `proxy.ts`, `next-pwa` yok
- **Plan:** "Next.js 14". **Gerçek:** Next.js 16.4 (Turbopack). `middleware.ts` yerine `src/proxy.ts`.
- **Karar:** `next-pwa` Turbopack ile uyumsuz, kaldırıldı. PWA için kendi service worker'ımız Faz 6'da yazılacak. Plan dokümanı güncellendi.

### K-002 · Cihaz kaydı geçici olarak elle
- **Plan:** Cihaz kodu sunucuda atanır (FR-002). **Gerçek:** `useDevice.registerDevice` kodu istemcide üretiyor ve kurulum sihirbazı yok.
- **Karar:** Geliştirme ortamı için işletme/kullanıcı/cihaz kayıtları SQL ile elle eklendi. Sihirbaz ve sunucu tarafı atama Faz 1'de yapılacak (açık madde).

### K-001 · Test altyapısı
- **Karar:** Vitest kuruldu (`npm test`); tarayıcı veritabanı testleri için `fake-indexeddb`. Para, numaralandırma ve durum makinesi gibi iş kuralları testle yazılır.
