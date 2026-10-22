export const SYNC_TABLES = [
  "audit_logs",
  "customers",
  "machines",
  "machine_ownership_history",
  "suppliers",
  "opening_balances",
  "products",
  "product_serial_units",
  "stock_movements",
  "payments",
  "payment_allocations",
  "import_batches",
  "services",
  "service_parts",
  "service_operations",
  "service_approvals",
  "service_status_history",
  "sales",
  "sale_items",
  "purchases",
  "purchase_items",
  "return_transactions",
  "return_items",
  "notifications",
] as const;

export type SyncTableName = (typeof SYNC_TABLES)[number];

export const APPEND_ONLY_SYNC_TABLES = new Set<SyncTableName>([
  "audit_logs",
  "stock_movements",
  "payments",
  "payment_allocations",
  "service_status_history",
  "machine_ownership_history",
  "service_approvals",
]);

/**
 * Gönderim sırası: üst kayıtlar (müşteri, ürün, makine, servis…) alt kayıtlardan
 * (satırlar, ödemeler, hareketler, geçmiş) önce gider; böylece sunucuda yabancı
 * anahtar hatası oluşmaz (Adım 1.7, bağımlılık sırası).
 */
const PUSH_ORDER: readonly SyncTableName[] = [
  "customers",
  "suppliers",
  "products",
  "machines",
  "machine_ownership_history",
  "opening_balances",
  "import_batches",
  "product_serial_units",
  "stock_movements",
  "services",
  "service_operations",
  "service_parts",
  "service_approvals",
  "service_status_history",
  "payments",
  "payment_allocations",
  "sales",
  "sale_items",
  "purchases",
  "purchase_items",
  "return_transactions",
  "return_items",
  "notifications",
  "audit_logs",
];

/** Tablonun gönderim sırası (küçük önce gider). Bilinmeyen tablo en sona kalır. */
export function pushRank(table: string): number {
  const index = PUSH_ORDER.indexOf(table as SyncTableName);
  return index === -1 ? PUSH_ORDER.length : index;
}

export function isSyncTableName(value: unknown): value is SyncTableName {
  return (
    typeof value === "string" &&
    SYNC_TABLES.includes(value as SyncTableName)
  );
}
