import type { SupabaseClient } from "@supabase/supabase-js";
import { SYNC_TABLES, type SyncTableName } from "@/lib/sync/tables";
import { BACKUP_FORMAT, BACKUP_VERSION, backupTotal, type BackupFile } from "./backup";

/**
 * Sunucu tarafı günlük otomatik yedek (Adım 1.11, NFR-006). Zamanlanmış görev
 * (`/api/cron/backup`) her işletmenin tüm eşitlenen tablolarını özel `backups`
 * deposuna JSON olarak yazar, `business_backups` tablosuna durum kaydı atar ve en
 * son 30 yedeği tutar. Servis anahtarıyla çalışır; yalnızca sunucuda kullanılmalıdır.
 */

export const KEEP_BACKUPS = 30;
const PAGE = 1000;

export type ServerBackupResult = { businessId: string; ok: boolean; path?: string; total?: number; error?: string };

async function fetchAll(client: SupabaseClient, table: string, businessId: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select("*").eq("business_id", businessId).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function dumpBusiness(client: SupabaseClient, businessId: string): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  const counts: BackupFile["counts"] = {};
  for (const name of SYNC_TABLES) {
    const rows = await fetchAll(client, name, businessId);
    tables[name as SyncTableName] = rows;
    counts[name as SyncTableName] = rows.length;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    business_id: businessId,
    device_code: "SUNUCU",
    tables,
    counts,
  };
}

/** Bir işletmenin yedeğini alır, depoya yazar, durumu kaydeder ve eski yedekleri temizler. */
export async function backupBusiness(client: SupabaseClient, businessId: string, now: Date = new Date()): Promise<ServerBackupResult> {
  const day = now.toISOString().slice(0, 10);
  const path = `${businessId}/${day}.json`;
  try {
    const backup = await dumpBusiness(client, businessId);
    const body = JSON.stringify(backup);
    const upload = await client.storage.from("backups").upload(path, body, { contentType: "application/json", upsert: true });
    if (upload.error) throw new Error(upload.error.message);

    await client.from("business_backups").insert({
      business_id: businessId, kind: "AUTO", status: "OK", file_path: path,
      size_bytes: body.length, row_counts: backup.counts, created_by: "SUNUCU",
    });

    // Eski yedekleri temizle (son KEEP_BACKUPS dosya kalır)
    const listed = await client.storage.from("backups").list(businessId, { limit: 1000, sortBy: { column: "name", order: "desc" } });
    const stale = (listed.data ?? []).slice(KEEP_BACKUPS).map((f) => `${businessId}/${f.name}`);
    if (stale.length > 0) await client.storage.from("backups").remove(stale);

    return { businessId, ok: true, path, total: backupTotal(backup) };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Bilinmeyen hata";
    await client.from("business_backups").insert({
      business_id: businessId, kind: "AUTO", status: "FAILED", error, created_by: "SUNUCU",
    });
    return { businessId, ok: false, error };
  }
}

export async function backupAllBusinesses(client: SupabaseClient, now: Date = new Date()): Promise<ServerBackupResult[]> {
  const { data, error } = await client.from("businesses").select("id");
  if (error) throw new Error(error.message);
  const results: ServerBackupResult[] = [];
  for (const b of (data ?? []) as { id: string }[]) results.push(await backupBusiness(client, b.id, now));
  return results;
}
