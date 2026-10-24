import Dexie, { type Table } from "dexie";
import type {
  MachineOwnershipChange,
  Business,
  BusinessSettings,
  User,
  Device,
  Customer,
  Machine,
  Supplier,
  Product,
  ProductSerialUnit,
  StockMovement,
  Payment,
  AuditLog,
  SyncQueueItem,
  Notification,
} from "@/types";

// ============================================================
// FAZ 2-7 İçin Ek Tipler (şema erken tanımlanıyor)
// ============================================================

export interface OpeningBalance {
  id: string;
  business_id: string;
  party_type: "CUSTOMER" | "SUPPLIER";
  party_id: string;
  direction: "OWED_BY_PARTY" | "OWED_TO_PARTY";
  amount: number;
  as_of_date: string;
  source_note?: string;
  import_batch_id?: string;
  created_at: string;
}

export interface PaymentAllocation {
  id: string;
  business_id: string;
  payment_id: string;
  source_type: string; // 'SERVICE' | 'SALE' | 'OPENING_BALANCE'
  source_id: string;
  allocated_amount: number;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  business_id: string;
  file_name: string;
  file_hash: string;
  imported_at: string;
  row_count: number;
  error_count: number;
  status: "PENDING" | "COMPLETED" | "FAILED";
}

// Service tipi (FAZ 3)
export interface Service {
  id: string;
  business_id: string;
  document_no: string;
  customer_id?: string;
  machine_id?: string;
  status: string;
  description?: string;
  customer_complaint?: string;
  diagnosis?: string;
  resolution?: string;
  deposit_amount: number;
  labor_fee: number;
  total_amount: number;
  promised_date?: string;
  received_date: string;
  completed_date?: string;
  delivered_date?: string;
  first_completed_at?: string;
  warranty_until?: string;
  is_warranty_claim: boolean;
  /** Garanti kaynağı (üretici, bayi, satış garantisi…) ve kapsam açıklaması */
  warranty_source?: string;
  warranty_coverage?: string;
  cancel_reason?: string;
  /** Kabulde belirtilen mevcut hasar / çizikler */
  existing_damage?: string;
  /** Kabulde teslim alınan aksesuarlar */
  received_accessories?: string;
  /** Teslim alan kişi (müşteri değilse adı) */
  delivered_to?: string;
  /** Teslim anındaki kalan servis bakiyesi (> 0: borçlu teslim) */
  delivery_balance?: number;
  /** Borçlu teslimde müşterinin borcu kabul ettiği (AC-025) */
  debt_acknowledged?: boolean;
  /** Borçlu teslimde söz verilen ödeme tarihi (YYYY-MM-DD); boşsa vade yok */
  due_date?: string;
  /** Sunucu kayıt sürümü; güncellemede çakışma tespiti için gönderilir. */
  version?: number;
  created_by_device: string;
  created_at: string;
  updated_at: string;
}

export interface ServicePart {
  id: string;
  business_id: string;
  service_id: string;
  product_id?: string;
  serial_unit_id?: string;
  description_snapshot: string;
  quantity: number;
  unit: string;
  unit_price_snapshot: number;
  unit_cost_snapshot: number;
  /** Parçanın kaynağı: stok ürünü, müşterinin getirdiği, stok dışı alım, diğer */
  source_type: PartSourceType;
  /** Müşteri kararı (K-022): PENDING | APPROVED | REJECTED | DEFERRED */
  status: LineStatus;
  /** Fiilen kullanılan miktar; stoktan düşüm bu değerle olur (SR-008) */
  used_quantity: number;
  supply_status: PartSupplyStatus;
  expected_at?: string;
  discount_amount: number;
  tax_mode: string;
  tax_rate: number;
  line_total: number;
  stock_movement_id?: string;
  approved_at?: string;
  approved_amount?: number;
  /** Sunucu kayıt sürümü; güncellemede çakışma tespiti için gönderilir. */
  version?: number;
  created_at: string;
  updated_at: string;
}

export type PartSourceType = "STOCK_PRODUCT" | "CUSTOMER_SUPPLIED" | "NON_STOCK_PURCHASE" | "OTHER";
export type PartSupplyStatus = "IN_STOCK" | "TO_ORDER" | "ORDERED" | "ARRIVED";
export type LineStatus = "PENDING" | "APPROVED" | "REJECTED" | "DEFERRED";

/** Servis işlem (işçilik) satırı — migration 014 */
export interface ServiceOperation {
  id: string;
  business_id: string;
  service_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_mode: string;
  tax_rate: number;
  line_total: number;
  /** Fiyat henüz belirlenmedi (SR-007); tamamlamayı engeller */
  price_pending: boolean;
  status: LineStatus;
  version?: number;
  created_at: string;
  updated_at: string;
}

/** İşlem kataloğu — migration 021 (Adım 3.5) */
export interface OperationCatalogEntry {
  id: string;
  business_id: string;
  name: string;
  category: string;
  suggested_price?: number;
  default_duration?: number;
  active: boolean;
  version?: number;
  created_at: string;
  updated_at: string;
}

/** Arıza kataloğu — migration 021 (Adım 3.5) */
export interface IssueCatalogEntry {
  id: string;
  business_id: string;
  name: string;
  category: string;
  active: boolean;
  version?: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceTemplate {
  id: string;
  business_id: string;
  name: string;
  machine_type?: string;
  active: boolean;
  version?: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceTemplateItem {
  id: string;
  business_id: string;
  template_id: string;
  title: string;
  required: boolean;
  sort_order: number;
  version?: number;
  created_at: string;
  updated_at: string;
}

/** Servise kopyalanan kontrol listesi maddesi (AC-005): şablon sonradan değişse de değişmez */
export interface ServiceChecklistItem {
  id: string;
  business_id: string;
  service_id: string;
  template_item_id?: string;
  title_snapshot: string;
  required: boolean;
  sort_order: number;
  is_completed: boolean;
  completed_at?: string;
  completed_by?: string;
  completed_by_device?: string;
  note?: string;
  version?: number;
  created_at: string;
  updated_at: string;
}

/** Müşteri onay kaydı (yalnızca-ekleme) — AC-004, AC-042 */
export interface ServiceApproval {
  id: string;
  business_id: string;
  service_id: string;
  decision: "APPROVED" | "REJECTED" | "DEFERRED" | "PARTIAL";
  method: "IN_PERSON" | "PHONE" | "OTHER";
  approved_amount: number;
  explanation?: string;
  actor_id?: string;
  changed_by_device: string;
  decided_at: string;
}

export interface ServiceStatusHistory {
  id: string;
  business_id: string;
  service_id: string;
  from_status?: string;
  to_status: string;
  actor_id?: string;
  changed_by_device: string;
  note?: string;
  changed_at: string;
}

// Sale tipi (FAZ 4)
export interface Sale {
  id: string;
  business_id: string;
  document_no: string;
  customer_id?: string;
  sale_date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total_amount: number;
  status: "DRAFT" | "FINAL" | "CANCELLED";
  cancel_reason?: string;
  notes?: string;
  /** Satışın kesinleştiği an; stok çıkışı ve tahsilat bu anda yapılır */
  finalized_at?: string;
  /** Vade (YYYY-MM-DD); boşsa vade yok */
  due_date?: string;
  /** Sunucu kayıt sürümü; güncellemede çakışma tespiti için gönderilir. */
  version?: number;
  created_by_device: string;
  created_at: string;
  updated_at: string;
}

export interface SaleItem {
  id: string;
  business_id: string;
  sale_id: string;
  product_id?: string;
  serial_unit_id?: string;
  machine_id?: string;
  description_snapshot: string;
  quantity: number;
  unit: string;
  unit_price_snapshot: number;
  unit_cost_snapshot: number;
  discount_amount: number;
  tax_mode: string;
  tax_rate: number;
  line_total: number;
  stock_movement_id?: string;
  created_at: string;
}

// Purchase tipi (FAZ 4)
export interface Purchase {
  id: string;
  business_id: string;
  document_no: string;
  supplier_id?: string;
  purchase_date: string;
  total_amount: number;
  status: "DRAFT" | "RECEIVED" | "CANCELLED";
  notes?: string;
  /** Tedarikçinin fatura / irsaliye numarası (bilgi amaçlı) */
  supplier_ref?: string;
  /** Teslim alındığı an; stok girişi bu anda yapılır */
  received_at?: string;
  cancel_reason?: string;
  /** Sunucu kayıt sürümü; güncellemede çakışma tespiti için gönderilir. */
  version?: number;
  created_by_device: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseItem {
  id: string;
  business_id: string;
  purchase_id: string;
  product_id?: string;
  description_snapshot: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_discount: number;
  tax_mode: string;
  tax_rate: number;
  line_total: number;
  stock_movement_id?: string;
  /** Seri takipli ürün satırında girilen seri numaraları (boş girilenler iç numarayla tanınır) */
  serial_numbers?: string[] | null;
  created_at: string;
}

// Return tipi (FAZ 5)
export interface ReturnTransaction {
  id: string;
  business_id: string;
  document_no: string;
  original_type: string; // 'SALE' | 'PURCHASE' | 'SERVICE'
  original_id: string;
  return_date: string;
  reason?: string;
  refund_method?: string;
  total_amount: number;
  status: "POSTED" | "REVERSED";
  /** Para iadesi ödemesi (müşteri alacağına yazıldıysa yok) */
  refund_payment_id?: string;
  reversal_reason?: string;
  version?: number;
  created_by_device: string;
  created_at: string;
}

export interface ReturnItem {
  id: string;
  business_id: string;
  return_id: string;
  original_line_type: string;
  original_line_id: string;
  product_id?: string;
  serial_unit_id?: string;
  quantity: number;
  unit: string;
  amount: number;
  stock_disposition: "SELLABLE" | "DAMAGED" | "NOT_RETURNED";
  stock_movement_id?: string;
  created_at: string;
}

/** Cihaz bazlı kalıcı belge sıra sayacı (Adım 1.6). key: "<kind>:<cihaz>:<yıl|-->" */
export interface DocumentCounter {
  key: string;
  last_value: number;
}

// ============================================================
// DEXIE VERİTABANI SINIFI
// ============================================================

export class VeltrioDatabase extends Dexie {
  // FAZ 1 — Temel tablolar
  businesses!: Table<Business>;
  users!: Table<User>;
  devices!: Table<Device>;
  audit_logs!: Table<AuditLog>;
  sync_queue!: Table<SyncQueueItem>;
  notifications!: Table<Notification>;
  counters!: Table<DocumentCounter>;

  // FAZ 2 — Stok & Ödeme
  customers!: Table<Customer>;
  machines!: Table<Machine>;
  machine_ownership_history!: Table<MachineOwnershipChange>;
  suppliers!: Table<Supplier>;
  products!: Table<Product>;
  product_serial_units!: Table<ProductSerialUnit>;
  stock_movements!: Table<StockMovement>;
  payments!: Table<Payment>;
  payment_allocations!: Table<PaymentAllocation>;
  opening_balances!: Table<OpeningBalance>;
  import_batches!: Table<ImportBatch>;

  // FAZ 3 — Servis
  services!: Table<Service>;
  service_parts!: Table<ServicePart>;
  service_status_history!: Table<ServiceStatusHistory>;
  service_operations!: Table<ServiceOperation>;
  service_approvals!: Table<ServiceApproval>;
  operation_catalog!: Table<OperationCatalogEntry>;
  issue_catalog!: Table<IssueCatalogEntry>;
  service_templates!: Table<ServiceTemplate>;
  service_template_items!: Table<ServiceTemplateItem>;
  service_checklist_items!: Table<ServiceChecklistItem>;

  // FAZ 4 — Ticaret
  sales!: Table<Sale>;
  sale_items!: Table<SaleItem>;
  purchases!: Table<Purchase>;
  purchase_items!: Table<PurchaseItem>;

  // FAZ 5 — İade
  return_transactions!: Table<ReturnTransaction>;
  return_items!: Table<ReturnItem>;

  constructor() {
    super("veltrio_db");

    // Şema sürüm 1
    this.version(1).stores({
      // --- FAZ 1 ---
      businesses: "id, device_code_prefix",
      users: "id, business_id, email",
      devices: "id, business_id, device_code, is_active",
      audit_logs: "id, business_id, entity_type, entity_id, changed_at",
      sync_queue: "id, table_name, record_id, status, created_at",
      notifications: "id, business_id, type, dedupe_key, read_at, resolved_at",

      // --- FAZ 2 ---
      customers:
        "id, business_id, phone_normalized, archived_at, created_at",
      machines:
        "id, business_id, customer_id, serial_number, is_temporary, archived_at",
      suppliers: "id, business_id, archived_at",
      products: "id, business_id, code, category, archived_at",
      product_serial_units:
        "id, business_id, product_id, serial_number, status, machine_id",
      stock_movements:
        "id, business_id, product_id, movement_type, source_type, source_id, created_at",
      payments:
        "id, business_id, direction, method, customer_id, supplier_id, source_type, source_id, status, payment_date",
      payment_allocations:
        "id, business_id, payment_id, source_type, source_id",
      opening_balances:
        "id, business_id, party_type, party_id, as_of_date, import_batch_id",
      import_batches: "id, business_id, file_hash, status",

      // --- FAZ 3 ---
      services:
        "id, business_id, document_no, customer_id, machine_id, status, promised_date, created_at",
      service_parts:
        "id, business_id, service_id, product_id, serial_unit_id, status",
      service_status_history:
        "id, business_id, service_id, to_status, changed_at",

      // --- FAZ 4 ---
      sales: "id, business_id, document_no, customer_id, status, sale_date",
      sale_items: "id, business_id, sale_id, product_id, serial_unit_id",
      purchases:
        "id, business_id, document_no, supplier_id, status, purchase_date",
      purchase_items: "id, business_id, purchase_id, product_id",

      // --- FAZ 5 ---
      return_transactions:
        "id, business_id, document_no, original_type, original_id, status",
      return_items: "id, business_id, return_id, product_id, serial_unit_id",
    });

    // Şema sürüm 2: belge sıra sayaçları
    this.version(2).stores({
      counters: "key",
    });

    // Şema sürüm 3: makine sahiplik geçmişi
    this.version(3).stores({
      machine_ownership_history: "id, business_id, machine_id, changed_at",
    });

    // Şema sürüm 4: servis işlem satırları ve müşteri onayları
    this.version(4).stores({
      service_operations: "id, business_id, service_id",
      service_approvals: "id, business_id, service_id, decided_at",
    });

    // Şema sürüm 6: kataloglar, şablonlar ve servis kontrol listesi
    this.version(6).stores({
      operation_catalog: "id, business_id, category, active",
      issue_catalog: "id, business_id, category, active",
      service_templates: "id, business_id, active",
      service_template_items: "id, business_id, template_id",
      service_checklist_items: "id, business_id, service_id",
    });

    // Şema sürüm 5: iade satırları, orijinal satış satırına göre aranır
    this.version(5).stores({
      return_items: "id, business_id, return_id, product_id, serial_unit_id, original_line_id",
    });
  }
}

// Singleton instance — uygulama boyunca tek bir DB bağlantısı
export const db = new VeltrioDatabase();
