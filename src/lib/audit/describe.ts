import type { AuditLog } from "@/types";

/**
 * Audit log kayıtlarını ekranda okunur hale getirir (Adım 1.8, AC-032): hangi kayıt
 * türü, ne yapıldı, eski/yeni değerler ve ilgili kayda bağlantı.
 */

export const ENTITY_LABEL: Record<string, string> = {
  services: "Servis",
  sales: "Satış",
  purchases: "Alım",
  payments: "Ödeme",
  products: "Ürün",
  customers: "Müşteri",
  machines: "Makine",
  suppliers: "Tedarikçi",
  opening_balances: "Açılış bakiyesi",
  return_transactions: "İade",
  devices: "Cihaz",
  businesses: "İşletme ayarları",
  backups: "Yedek",
};

export const ACTION_LABEL: Record<AuditLog["action"], string> = {
  CREATE: "Oluşturuldu",
  UPDATE: "Değiştirildi",
  DELETE: "Silindi",
  STATE_CHANGE: "Durum değişti",
  RESTORE: "Geri yüklendi",
};

const HREF: Record<string, string> = {
  services: "/services/",
  sales: "/sales/",
  purchases: "/purchases/",
  products: "/products/",
  customers: "/customers/",
  machines: "/machines/",
  suppliers: "/suppliers/",
};

export function entityHref(log: Pick<AuditLog, "entity_type" | "entity_id">): string | null {
  const base = HREF[log.entity_type];
  return base ? `${base}${log.entity_id}` : null;
}

/** Alan adlarını okunur Türkçe etikete çevirir (bilinmeyen alan olduğu gibi kalır). */
const FIELD_LABEL: Record<string, string> = {
  status: "Durum",
  customer_id: "Müşteri",
  name: "Ad",
  stock_available: "Satılabilir stok",
  stock_damaged: "Hasarlı stok",
  amount: "Tutar",
  total_amount: "Toplam",
  direction: "Yön",
  document_no: "Belge no",
  merged_into_id: "Birleştirildiği makine",
  archived_at: "Arşiv tarihi",
  reversal_id: "Ters kayıt",
  settings: "Ayarlar",
  device_code: "Cihaz kodu",
  is_active: "Etkin",
};

const formatValue = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/** "Alan: eski → yeni" satırları; yalnızca bir tarafta bulunan alanlar da gösterilir. */
export function describeChange(log: Pick<AuditLog, "old_value" | "new_value">): string[] {
  const keys = new Set([...Object.keys(log.old_value ?? {}), ...Object.keys(log.new_value ?? {})]);
  const lines: string[] = [];
  for (const key of keys) {
    const label = FIELD_LABEL[key] ?? key;
    const before = log.old_value?.[key];
    const after = log.new_value?.[key];
    if (before === undefined && after !== undefined) lines.push(`${label}: ${formatValue(after)}`);
    else if (after === undefined) lines.push(`${label}: ${formatValue(before)} → —`);
    else if (JSON.stringify(before) !== JSON.stringify(after)) lines.push(`${label}: ${formatValue(before)} → ${formatValue(after)}`);
  }
  return lines;
}
