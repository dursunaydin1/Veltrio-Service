# Supabase Migration Kılavuzu

Bu dizin Supabase PostgreSQL migration dosyalarını içerir.

## Migration Sırası

| # | Dosya | İçerik |
|---|-------|--------|
| 001 | `001_initial_schema.sql` | businesses, users, devices, audit_logs, RLS |
| 002 | `002_customers_machines_suppliers.sql` | customers, machines, suppliers, opening_balances |
| 003 | `003_products_stock.sql` | products, serial_units, stock_movements, payments |
| 004 | `004_services_sales_returns.sql` | services, sales, purchases, returns, notifications |

## Supabase Dashboard'dan Uygulama

1. [Supabase Dashboard](https://app.supabase.com) → Projenizi seçin
2. **SQL Editor** sekmesine girin
3. Migration dosyalarını **sırasıyla** çalıştırın (001 → 002 → 003 → 004)

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

## Önemli Notlar

- **RLS**: Tüm tablolarda Row Level Security aktif. `business_id` izolasyonu zorunlu.
- **Immutable**: `stock_movements` ve `audit_logs` güncellenemez/silinemez (RULE ile korunuyor).
- **decimal(15,4)**: Tüm para ve miktar alanları bu hassasiyetle saklanır.
- **UTC**: Tüm timestamp'ler UTC olarak saklanır.
- **Seed**: `seed/` klasörü yalnızca geliştirme ortamı içindir.
