import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { isSyncTableName } from "@/lib/sync/tables";

/**
 * Eşitleme çakışması çözümü (Adım 2.10, 6.7, AC-026, FR-021): sessiz ezme yoktur,
 * kullanıcı iki yoldan birini seçer.
 *  - Sunucudaki sürümü al: yerel değişiklik atılır, kayıt sunucudaki hâliyle yerele yazılır.
 *  - Benim değişikliğimi uygula: sunucudaki güncel sürüm numarası alınır ve yerel
 *    değişiklik o sürüm üzerine yeniden gönderilir (sunucudaki başka değişiklik ezilir).
 * Her ikisi de çevrimiçi gerektirir ve kuyrukta kayıt bırakmaz / PENDING yapar.
 */

export class ConflictResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictResolveError";
  }
}

async function loadItem(id: string) {
  const item = await db.sync_queue.get(id);
  if (!item) throw new ConflictResolveError("Kuyruk kaydı bulunamadı.");
  if (!isSyncTableName(item.table_name)) throw new ConflictResolveError("Bilinmeyen tablo.");
  return item;
}

export async function resolveKeepServer(supabase: SupabaseClient, queueItemId: string): Promise<void> {
  const item = await loadItem(queueItemId);
  const { data, error } = await supabase.from(item.table_name).select("*").eq("id", item.record_id).maybeSingle();
  if (error) throw new ConflictResolveError("Sunucudaki kayıt alınamadı.");
  await db.transaction("rw", db.table(item.table_name), db.sync_queue, async () => {
    if (data) await db.table(item.table_name).put(data);
    else await db.table(item.table_name).delete(item.record_id); // sunucuda silinmiş
    await db.sync_queue.delete(queueItemId);
  });
}

export async function resolveKeepMine(supabase: SupabaseClient, queueItemId: string): Promise<void> {
  const item = await loadItem(queueItemId);
  if (item.operation !== "UPDATE") throw new ConflictResolveError("Yalnızca güncelleme çakışmaları bu şekilde çözülür.");
  const { data, error } = await supabase.from(item.table_name).select("version").eq("id", item.record_id).maybeSingle();
  if (error) throw new ConflictResolveError("Sunucudaki sürüm alınamadı.");
  if (!data) throw new ConflictResolveError("Kayıt sunucuda artık yok; “Sunucudaki sürümü al” ile temizleyin.");
  await db.sync_queue.update(queueItemId, {
    status: "PENDING",
    retry_count: 0,
    error_message: undefined,
    payload: { ...item.payload, version: (data as { version: number }).version },
  });
}

/** Hatalı (ERROR) kaydı yeniden denemek üzere kuyruğa geri alır. */
export async function retryItem(queueItemId: string): Promise<void> {
  await db.sync_queue.update(queueItemId, { status: "PENDING", retry_count: 0, error_message: undefined });
}
