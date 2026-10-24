# Supabase Migration Kılavuzu

Bu dizin Supabase PostgreSQL migration dosyalarını içerir.

## Migration Sırası

| # | Dosya | İçerik |
|---|-------|--------|
| 001 | `001_initial_schema.sql` | businesses, users, devices, audit_logs, RLS |
| 002 | `002_customers_machines_suppliers.sql` | customers, machines, suppliers, opening_balances |
| 003 | `003_products_stock.sql` | products, serial_units, stock_movements, payments |
| 004 | `004_services_sales_returns.sql` | services, sales, purchases, returns, notifications |
| 005 | `005_sync_changes.sql` | Cihazlar arası artımlı eşitleme günlüğü ve kayıt tetikleyicileri |
| 006 | `006_versioning_and_audit_sync.sql` | Kayıt sürümü (`version`), audit log eşitleme, ayar varsayılanları |
| 007 | `007_register_device.sql` | Sunucu tarafı cihaz kaydı (`register_device`), cihaz tablosu yetki sıkılaştırması |
| 008 | `008_product_catalog_fields.sql` | Ürün marka, model, raf ve uyumlu model alanları |
| 009 | `009_stock_ledger.sql` | Stok hareketi kovası/ters kaydı, ürün stok özeti tetikleyicisi |
| 010 | `010_customer_fields.sql` | Müşteri `no_phone_flag` alanı |
| 011 | `011_payment_reversal_unique.sql` | Bir ödemenin yalnızca bir kez ters kaydedilmesi (benzersiz indeks) |
| 012 | `012_machines_ownership.sql` | Makine iç numarası, sahiplik geçmişi tablosu |
| 013 | `013_service_intake_status.sql` | Servis durum kümesi (PRD §6.1), kabul alanları, durum geçmişi aktörü |
| 014 | `014_service_lines_approvals.sql` | Servis işlem satırları, parça satırı genişletme, müşteri onay kayıtları |
| 015 | `015_service_delivery.sql` | Servis teslim bilgileri (teslim alan, kalan bakiye, borç kabulü) |
| 016 | `016_purchase_fields.sql` | Satın alma: tedarikçi fatura no, teslim alma zamanı, iptal nedeni |
| 017 | `017_sale_fields.sql` | Satış: not ve kesinleşme zamanı |
| 018 | `018_serial_units.sql` | Seri takipli birimler (iç numara, bağlantılar), alım satırı seri no'ları, makine satış bilgisi |
| 019 | `019_return_refund.sql` | Müşteri iadesi: para iadesi ödemesi bağlantısı, geri alma nedeni |
| 020 | `020_due_dates.sql` | Vade tarihi: satış ve servis (borçlu teslim) |

## Supabase Dashboard'dan Uygulama

1. [Supabase Dashboard](https://app.supabase.com) → Projenizi seçin
2. **SQL Editor** sekmesine girin
3. Migration dosyalarını **sırasıyla** çalıştırın (001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012 → 013 → 014 → 015 → 016 → 017 → 018 → 019 → 020)

## Supabase CLI ile Uygulama

```bash
# Supabase CLI kurulumu
npm install -g supabase

# Login
supabase login

# Projeyi bağla (Project ID → Supabase Dashboard > Settings > General)
supabase link --project-ref YOUR_PROJECT_ID

# Migration'ları uygula
supabase db push
```

Eşitleme API'si oturum açmış Supabase kullanıcısını ve aktif cihaz kaydını doğrular.
`005_sync_changes.sql` migration'ı uygulanmadan `/api/sync/push` ve
`/api/sync/pull` uç noktaları çalışmaz.

## Önemli Notlar

- **RLS**: Tüm tablolarda Row Level Security aktif. `business_id` izolasyonu zorunlu.
- **Immutable**: `stock_movements` ve `audit_logs` güncellenemez/silinemez (RULE ile korunuyor).
- **decimal(15,4)**: Tüm para ve miktar alanları bu hassasiyetle saklanır.
- **UTC**: Tüm timestamp'ler UTC olarak saklanır.
- **Seed**: `seed/` klasörü yalnızca geliştirme ortamı içindir.

## Migration'ları komutla çalıştırma

`.env.local` içine `SUPABASE_DB_URL=<Supabase → Project Settings → Database → Connection string (URI)>` ekleyin
(gizlidir, commit edilmez). Sonra:

```bash
npm run db:migrate -- --baseline 020   # SQL Editor'da elle çalıştırılmış olanları bir kez işaretle
npm run db:migrate -- --status         # uygulanmış / bekleyen
npm run db:migrate                     # bekleyenleri sırayla çalıştır
```
