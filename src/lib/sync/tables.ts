export const SYNC_TABLES = [
  "customers",
  "machines",
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
  "stock_movements",
  "payments",
  "payment_allocations",
  "service_status_history",
]);

export function isSyncTableName(value: unknown): value is SyncTableName {
  return (
    typeof value === "string" &&
    SYNC_TABLES.includes(value as SyncTableName)
  );
}
