// ============================================================
// TEMEL TİPLER — PRD §3, §4
// ============================================================

export type UUID = string;
export type ISODateTimeString = string; // UTC, ISO 8601

// ============================================================
// İŞ TÜRÜ — PRD §4.2
// ============================================================

export interface Business {
  id: UUID;
  name: string;
  owner_name: string;
  phone?: string;
  address?: string;
  tax_number?: string;
  logo_url?: string;
  device_code_prefix: string; // 4 haneli, özel karaktersiz
  settings: BusinessSettings;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export interface BusinessSettings {
  default_tax_mode: TaxMode;
  default_tax_rate: number; // 0-100
  currency: "TRY";
  service_approval_threshold: number; // Onay gerektiren üst limit (TL)
  default_service_reminder_days: number; // Teslim hatırlatması
  /** Stoktan fazla çıkışa izin verilsin mi? Varsayılan false (ST-002). */
  allow_negative_stock?: boolean;
  /** Çevrimdışı çalışmanın azami günü (Adım 1.7). */
  max_offline_days?: number;
  locale: "tr-TR";
}

// ============================================================
// KULLANICI — PRD §4.3
// ============================================================

export interface User {
  id: UUID;
  business_id: UUID;
  email: string;
  name: string;
  role: "owner"; // MVP'de tek rol
  created_at: ISODateTimeString;
}

// ============================================================
// CİHAZ — PRD §4.4
// ============================================================

export interface Device {
  id: UUID;
  business_id: UUID;
  user_id: UUID;
  device_code: string; // [business_code]-[4 karakter]
  device_name: string;
  last_synced_at?: ISODateTimeString;
  is_active: boolean;
  revoked_at?: ISODateTimeString;
  created_at: ISODateTimeString;
}

// ============================================================
// MÜŞTERİ — PRD §4.5
// ============================================================

export interface Customer {
  id: UUID;
  business_id: UUID;
  name: string;
  phone?: string;
  phone_normalized?: string;
  village?: string;
  address?: string;
  notes?: string;
  archived_at?: ISODateTimeString;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

// ============================================================
// MAKİNE — PRD §4.5
// ============================================================

export interface Machine {
  id: UUID;
  business_id: UUID;
  customer_id?: UUID;
  type: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  year?: number;
  is_temporary: boolean; // Henüz müşteriyle eşleştirilmemiş
  merged_into_id?: UUID;
  qr_code?: string;
  notes?: string;
  archived_at?: ISODateTimeString;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

// ============================================================
// TEDARİKÇİ — PRD §4.6
// ============================================================

export interface Supplier {
  id: UUID;
  business_id: UUID;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  archived_at?: ISODateTimeString;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

// ============================================================
// ÜRÜN & STOK — PRD §7
// ============================================================

export type StockUnit =
  | "ADET"
  | "LITRE"
  | "KG"
  | "METRE"
  | "KUTU"
  | "TAKIM"
  | "PAKET"
  | "RULO"
  | string;

export type TaxMode = "INCLUSIVE" | "EXCLUSIVE" | "NONE";

export interface Product {
  id: UUID;
  business_id: UUID;
  name: string;
  code?: string;
  category?: string;
  brand?: string;
  model?: string;
  unit: StockUnit;
  is_serial_tracked: boolean;
  default_sale_price: number;
  last_purchase_price?: number;
  default_tax_mode: TaxMode;
  default_tax_rate: number;
  critical_stock_level?: number;
  stock_available: number; // Anlık satılabilir stok
  stock_damaged: number;   // Hasarlı stok (satışa dahil değil)
  compatible_models_note?: string;
  storage_location?: string;
  /** Sunucu kayıt sürümü; güncellemede çakışma tespiti için gönderilir. */
  version?: number;
  archived_at?: ISODateTimeString;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export type SerialUnitStatus = "IN_STOCK" | "SOLD" | "DAMAGED" | "RETURNED";

export interface ProductSerialUnit {
  id: UUID;
  business_id: UUID;
  product_id: UUID;
  serial_number?: string;
  status: SerialUnitStatus;
  machine_id?: UUID;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

// ============================================================
// STOK HAREKETİ — PRD §7.4
// ============================================================

export type StockMovementType =
  | "OPENING"
  | "PURCHASE_IN"
  | "SALE_OUT"
  | "SERVICE_USE"
  | "RETURN_IN"
  | "RETURN_OUT"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "DAMAGED_IN"
  | "DAMAGED_DISPOSE"
  | "TRANSFER"
  | "CANCEL_REVERSAL";

/** Stok kovası: satılabilir veya hasarlı (ST-011). */
export type StockBucket = "AVAILABLE" | "DAMAGED";

export interface StockMovement {
  id: UUID;
  business_id: UUID;
  product_id: UUID;
  serial_unit_id?: UUID;
  movement_type: StockMovementType;
  bucket: StockBucket;
  quantity: number; // + giriş, - çıkış
  /** Bu hareketin düzelttiği hareket (ters kayıtlarda) */
  reversal_of_id?: UUID;
  unit_cost?: number;
  source_type?: string; // 'SERVICE' | 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | ...
  source_id?: UUID;
  note?: string;
  created_by_device: string;
  created_at: ISODateTimeString;
}

// ============================================================
// ÖDEME — PRD §9.4
// ============================================================

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
export type PaymentDirection = "IN" | "OUT";
export type PaymentStatus = "VALID" | "REVERSED";

export interface Payment {
  id: UUID;
  business_id: UUID;
  direction: PaymentDirection;
  method: PaymentMethod;
  amount: number;
  payment_date: ISODateTimeString;
  customer_id?: UUID;
  supplier_id?: UUID;
  source_type?: string; // 'SERVICE' | 'SALE' | 'RETURN' | ...
  source_id?: UUID;
  note?: string;
  status: PaymentStatus;
  reversal_of_id?: UUID;
  created_by_device: string;
  created_at: ISODateTimeString;
}

// ============================================================
// AUDİT LOG — PRD §4.9
// ============================================================

export interface AuditLog {
  id: UUID;
  business_id: UUID;
  entity_type: string;
  entity_id: UUID;
  action: "CREATE" | "UPDATE" | "DELETE" | "STATE_CHANGE" | "RESTORE";
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  /** İşlemi yapan kullanıcı (users.id) */
  actor_id?: UUID;
  /** Kritik işlemlerde zorunlu gerekçe */
  reason?: string;
  changed_by_device: string;
  changed_at: ISODateTimeString;
}

// ============================================================
// EŞİTLEME — PRD §13
// ============================================================

export type SyncStatus = "PENDING" | "SYNCED" | "CONFLICT" | "ERROR";

export interface SyncQueueItem {
  id: UUID;
  table_name: string;
  record_id: UUID;
  operation: "INSERT" | "UPDATE" | "DELETE";
  payload: Record<string, unknown>;
  device_code: string;
  status: SyncStatus;
  retry_count: number;
  error_message?: string;
  created_at: ISODateTimeString;
  synced_at?: ISODateTimeString;
}

// ============================================================
// BİLDİRİM — PRD §14
// ============================================================

export type NotificationType =
  | "CUSTOMER_APPROVAL_NEEDED"
  | "PART_WAITING"
  | "DELIVERY_REMINDER"
  | "SERVICE_COMPLETED"
  | "LOW_STOCK"
  | "PAYMENT_DUE"
  | "SYNC_CONFLICT";

export interface Notification {
  id: UUID;
  business_id: UUID;
  type: NotificationType;
  related_record_id?: UUID;
  message: string;
  dedupe_key: string;
  read_at?: ISODateTimeString;
  resolved_at?: ISODateTimeString;
  created_at: ISODateTimeString;
}
