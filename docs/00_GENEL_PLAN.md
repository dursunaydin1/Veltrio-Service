# Veltrio Service — Geliştirme Planı (Ana Döküman)

> PRD v2.1 temel alınarak hazırlanmıştır. | Tarih: Ekim 2026

---

## Proje Özeti

Benzinli tarım ve ağaç makineleri satan ve servis eden bir işletme için;
- Servis yönetimi (kabul → teşhis → onay → tamamlama → teslim)
- Ürün satışı (hızlı satış, makine satışı, seri takipli stok)
- Stok takibi (hareketler, hasarlı stok, kritik stok uyarısı)
- Müşteri ve tedarikçi cari hesapları
- Çevrimdışı çalışma + eşitleme (PWA)

hedefleyen tek kullanıcılı, mobil öncelikli bir yönetim uygulaması.

---

## Faz Yapısı (PRD §20)

| Faz | Ad | Açıklama | Döküman |
|-----|----|-----------|---------|
| **FAZ 1** | Temel Omurga | Auth, cihaz, UUID, eşitleme altyapısı, audit log | [01_FAZ1_TEMEL_OMURGA.md](./01_FAZ1_TEMEL_OMURGA.md) |
| **FAZ 2** | Stok & Ödeme Çekirdeği | Ürün, stok hareketleri, ödeme ve bakiye | [02_FAZ2_STOK_ODEME.md](./02_FAZ2_STOK_ODEME.md) |
| **FAZ 3** | Servis Modülü | Servis emirleri, durum yönetimi, onay, fiş | [03_FAZ3_SERVIS.md](./03_FAZ3_SERVIS.md) |
| **FAZ 4** | Ticaret Modülü | Satış, satın alma, tedarikçi, seri takip | [04_FAZ4_TICARET.md](./04_FAZ4_TICARET.md) |
| **FAZ 5** | Finans & İade | Veresiye, vade, açılış bakiyesi, iadeler, iptal | [05_FAZ5_FINANS_IADE.md](./05_FAZ5_FINANS_IADE.md) |
| **FAZ 6** | İçe/Dışa Aktarma & Raporlar | Excel/CSV import-export, raporlar, bildirimler | [06_FAZ6_RAPOR_IMPORT.md](./06_FAZ6_RAPOR_IMPORT.md) |
| **FAZ 7** | Sağlamlaştırma | Test, güvenlik, UAT, canlıya çıkış | [07_FAZ7_SAGLAM.md](./07_FAZ7_SAGLAM.md) |

---

## Mimari Kararlar (PRD §21 — Geliştiriciye Bırakılan)

Aşağıdaki kararlar ilerleyen adımlarda netleştirilecektir:

| Karar Alanı | Karar |
|-------------|-------|
| **Frontend framework** | ✅ **Next.js 16 (App Router)** — SSR + PWA desteği, mobil öncelikli |
| **Backend / BaaS** | ✅ **Supabase** — PostgreSQL + Auth + Realtime + Storage |
| **Veritabanı** | ✅ **PostgreSQL** (Supabase üzerinde) — decimal tip, UUID, audit log |
| **Yerel depolama** | ✅ **Dexie.js** (IndexedDB wrapper) — çevrimdışı kayıt + eşitleme kuyruğu |
| **Auth** | ✅ **Supabase Auth** — hesap/şifre + e-posta kurtarma |
| **Eşitleme** | ✅ Custom diff + Supabase Realtime — idempotent, append-only |
| **PDF üretimi** | ✅ **jsPDF** veya **react-pdf** — tarayıcı taraflı PDF |
| **XLSX üretimi** | ✅ **SheetJS (xlsx)** — Türkçe karakter desteğiyle |
| **Hosting** | ✅ **Vercel** (Next.js) + Supabase Cloud |

> **Not:** PRD §21'e göre teknoloji değişse bile UUID, business_id izolasyonu, audit log, decimal para tipi ve UTC saklama prensipleri korunmalıdır.

---

## Değişmez İş Kuralları (Tüm Fazlarda Geçerli)

1. **UUID kullanımı:** Her kayıt sunucudan bağımsız UUID ile oluşturulur.
2. **business_id izolasyonu:** Tüm kayıtlar business_id ile kapsamlanır; sunucu her istekte kontrol eder.
3. **Decimal para:** Kayan noktalı sayı kesinlikle kullanılmaz; kuruş hassasiyeti uçtan uca korunur.
4. **UTC saklama:** Tüm tarih-saatler UTC saklanır, kullanıcıya `Europe/Istanbul` gösterilir.
5. **Audit log:** Her kritik değişiklikte aktör, cihaz, tarih, eski/yeni değer ve gerekçe kaydedilir.
6. **Append-only finans:** Hatalı kayıtlar silinmez; ters kayıtla düzeltilir.
7. **Idempotent eşitleme:** Aynı kayıt yeniden gönderildiğinde kopya oluşmaz.
8. **version/sync_state:** Her kayıtta versiyon ve eşitleme durumu alanı bulunur.

---

## Temel Varlıklar (PRD §7 Özeti)

```
Business → User → Device
                      ↓
Customer ──┐
           ├──→ Machine ──→ ServiceOrder ──→ ServiceOperation
           │                              ──→ ServicePart ──→ StockMovement
           │                              ──→ ServiceApproval
           └──→ Sale ──→ SaleItem ──→ StockMovement
                      ──→ Payment ──→ PaymentAllocation

Supplier ──→ Purchase ──→ PurchaseItem ──→ StockMovement

Product ──→ ProductSerialUnit
        ──→ StockMovement
```

---

## Geliştirme Sırası Özeti

```
[FAZ 1] Auth + Cihaz + UUID + Eşitleme altyapısı
    ↓
[FAZ 2] Ürün kataloğu + Stok hareketleri + Ödeme sistemi
    ↓
[FAZ 3] Servis emirleri (tam akış)
    ↓
[FAZ 4] Satış + Satın alma + Seri takip
    ↓
[FAZ 5] İadeler + Açılış bakiyeleri + Veresiye
    ↓
[FAZ 6] Excel/CSV Import-Export + Raporlar
    ↓
[FAZ 7] Test + Güvenlik + Canlıya çıkış
```

---

## İlerleme Takibi

| Faz | Başlangıç | Tamamlanma | Durum |
|-----|-----------|------------|-------|
| FAZ 1 | 2026-10 | — | 🟡 Devam ediyor (eşitleme API, giriş akışı hazır) |
| FAZ 2 | — | — | 🔴 Başlamadı |
| FAZ 3 | — | — | 🔴 Başlamadı |
| FAZ 4 | — | — | 🔴 Başlamadı |
| FAZ 5 | — | — | 🔴 Başlamadı |
| FAZ 6 | — | — | 🔴 Başlamadı |
| FAZ 7 | — | — | 🔴 Başlamadı |

---

*Bu döküman geliştirme ilerledikçe güncellenecektir.*
