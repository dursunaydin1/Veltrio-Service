import { db } from "@/lib/db";
import { generateId, nowISO } from "@/lib/utils";
import type { SyncQueueItem } from "@/types";

type Operation = "INSERT" | "UPDATE" | "DELETE";

/**
 * Eşitleme kuyruğuna yeni bir kayıt ekler.
 * PRD §13: Çevrimdışı kayıtlar PENDING olarak kuyruğa yazılır.
 *
 * UPDATE işlemlerinde payload, kaydın düzenlemeye başlanan `version` değerini
 * içermelidir; sunucu bu sürüm güncel değilse değişikliği reddedip çakışma
 * (CONFLICT) bildirir.
 */
export async function enqueue(
  tableName: string,
  recordId: string,
  operation: Operation,
  payload: Record<string, unknown>,
  deviceCode: string
): Promise<void> {
  if (await mergeIntoPending(tableName, recordId, operation, payload)) {
    notifySyncRequested();
    return;
  }

  const item: SyncQueueItem = {
    id: generateId(),
    table_name: tableName,
    record_id: recordId,
    operation,
    payload,
    device_code: deviceCode,
    status: "PENDING",
    retry_count: 0,
    created_at: nowISO(),
  };
  await db.sync_queue.add(item);
  notifySyncRequested();
}

function notifySyncRequested(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("veltrio:sync-requested"));
  }
}

/**
 * Aynı kayda ait henüz gönderilmemiş (PENDING) değişiklik varsa yeni kuyruk
 * kaydı açmak yerine onunla birleştirir. Böylece çevrimdışı arka arkaya
 * yapılan düzenlemeler tek paket olarak gider ve aynı sürümden iki güncelleme
 * yüzünden sahte çakışma oluşmaz.
 *
 *   bekleyen INSERT  + UPDATE → INSERT, son hâliyle
 *   bekleyen INSERT  + DELETE → ikisi de silinir (sunucu hiç görmedi)
 *   bekleyen UPDATE  + UPDATE → UPDATE, ilk düzenlemenin `version` değeriyle
 *   bekleyen UPDATE  + DELETE → DELETE
 *
 * Birleştirme yapıldıysa true döner.
 */
async function mergeIntoPending(
  tableName: string,
  recordId: string,
  operation: Operation,
  payload: Record<string, unknown>
): Promise<boolean> {
  if (operation === "INSERT") return false;

  const pending = await db.sync_queue
    .where("record_id")
    .equals(recordId)
    .filter((q) => q.table_name === tableName && q.status === "PENDING")
    .first();
  if (!pending) return false;

  if (pending.operation === "INSERT") {
    if (operation === "DELETE") {
      await db.sync_queue.delete(pending.id);
    } else {
      await db.sync_queue.update(pending.id, { payload });
    }
    return true;
  }

  if (pending.operation === "UPDATE") {
    if (operation === "DELETE") {
      await db.sync_queue.update(pending.id, { operation: "DELETE", payload });
    } else {
      await db.sync_queue.update(pending.id, {
        payload: { ...payload, version: pending.payload.version },
      });
    }
    return true;
  }

  return false;
}

/**
 * PENDING durumdaki tüm kayıtları döner.
 * En eski kayıttan başlayarak FIFO sıralamayla.
 */
export async function getPendingItems(): Promise<SyncQueueItem[]> {
  return db.sync_queue
    .where("status")
    .equals("PENDING")
    .sortBy("created_at");
}

/**
 * Eşitleme başarılı → SYNCED olarak işaretle.
 */
export async function markSynced(id: string): Promise<void> {
  await db.sync_queue.update(id, {
    status: "SYNCED",
    synced_at: nowISO(),
  });
}

/**
 * Eşitleme başarısız → retry sayısını artır, gerekirse ERROR'a al.
 * PRD §13: Hatalı kayıt silinmez, kuyrukta kalır (AC-037).
 */
export async function markError(id: string, errorMessage: string): Promise<void> {
  const item = await db.sync_queue.get(id);
  if (!item) return;

  const retry_count = item.retry_count + 1;
  const status: SyncQueueItem["status"] =
    retry_count >= 5 ? "ERROR" : "PENDING";

  await db.sync_queue.update(id, {
    status,
    retry_count,
    error_message: errorMessage,
  });
}

/**
 * Çakışma kuyruğuna düşür.
 * PRD §13.4: Çakışan kayıt CONFLICT olarak işaretlenir, kullanıcı bildirilir.
 */
export async function markConflict(id: string, message?: string): Promise<void> {
  await db.sync_queue.update(id, { status: "CONFLICT", error_message: message });
}

/**
 * ERROR ve CONFLICT kayıtların sayısını döner.
 * Ayarlar ekranında bekleyen sorunlar olarak gösterilir.
 */
export async function getIssueCount(businessId: string): Promise<{
  errors: number;
  conflicts: number;
  pending: number;
}> {
  const all = await db.sync_queue.toArray();

  // business_id sync_queue'da doğrudan yok; payload içinden çekiyoruz
  const filtered = all.filter(
    (item) =>
      (item.payload as Record<string, unknown>)["business_id"] === businessId
  );

  return {
    errors: filtered.filter((i) => i.status === "ERROR").length,
    conflicts: filtered.filter((i) => i.status === "CONFLICT").length,
    pending: filtered.filter((i) => i.status === "PENDING").length,
  };
}

/**
 * Tüm SYNCED kayıtları temizler (disk tasarrufu).
 * Haftada bir veya manuel çağrılır.
 */
export async function purgeSynced(): Promise<number> {
  return db.sync_queue.where("status").equals("SYNCED").delete();
}
