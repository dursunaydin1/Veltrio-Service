import { db } from "@/lib/db";
import { generateId, nowISO } from "@/lib/utils";
import type { AuditLog } from "@/types";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "STATE_CHANGE" | "RESTORE";

/**
 * Audit log kaydı ekler.
 * PRD §4.9: Kritik işlemler değiştirilemez audit log'a yazılır.
 *
 * @param entityType - Tablo adı (örn. "services", "payments")
 * @param entityId   - Kayıt UUID'si
 * @param action     - Yapılan işlem
 * @param deviceCode - İşlemi yapan cihaz kodu
 * @param oldValue   - İşlem öncesi değer (UPDATE/DELETE/STATE_CHANGE için)
 * @param newValue   - İşlem sonrası değer (CREATE/UPDATE/STATE_CHANGE için)
 */
export async function writeAuditLog(params: {
  businessId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  deviceCode: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
}): Promise<void> {
  const log: AuditLog = {
    id: generateId(),
    business_id: params.businessId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    old_value: params.oldValue,
    new_value: params.newValue,
    changed_by_device: params.deviceCode,
    changed_at: nowISO(),
  };

  await db.audit_logs.add(log);
}

/**
 * Bir kaydın tüm audit geçmişini döner (en yeniden eskiye).
 */
export async function getEntityHistory(
  entityType: string,
  entityId: string
): Promise<AuditLog[]> {
  const logs = await db.audit_logs
    .where("[entity_type+entity_id]")
    .equals([entityType, entityId])
    .toArray()
    .catch(async () => {
      // Bileşik index yoksa fallback
      return db.audit_logs
        .filter(
          (l) => l.entity_type === entityType && l.entity_id === entityId
        )
        .toArray();
    });

  return logs.sort(
    (a, b) =>
      new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  );
}

/**
 * Durum geçişi için kısayol.
 * Örnek: servis WAITING → IN_PROGRESS
 */
export async function logStateChange(params: {
  businessId: string;
  entityType: string;
  entityId: string;
  fromStatus: string;
  toStatus: string;
  deviceCode: string;
  note?: string;
}): Promise<void> {
  await writeAuditLog({
    businessId: params.businessId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: "STATE_CHANGE",
    deviceCode: params.deviceCode,
    oldValue: { status: params.fromStatus },
    newValue: { status: params.toStatus, note: params.note },
  });
}
