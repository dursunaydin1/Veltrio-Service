import { db } from "@/lib/db";
import { SYNC_TABLES, pushRank, type SyncTableName } from "@/lib/sync/tables";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { nowISO } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";

/**
 * Yedekleme ve geri yükleme (Adım 1.11, FR-023, NFR-006, NFR-012).
 *
 * Yedek, bu cihazdaki tüm eşitlenen tabloların JSON dosyasıdır. Geri yükleme
 * **ekleyicidir**: dosyadaki kayıtlardan cihazda olmayanlar eklenir ve sunucuya
 * gönderilmek üzere kuyruğa alınır; var olan kayıtların üzerine yazılmaz. Böylece
 * geri yükleme yanlışlıkla güncel veriyi bozmaz. Geri yüklemeden önce mevcut durumun
 * ek yedeği alınır ve işlem audit log'a yazılır.
 */

export const BACKUP_FORMAT = "veltrio-backup";
export const BACKUP_VERSION = 1;
const LAST_BACKUP_KEY = "veltrio_last_backup";

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  created_at: string;
  business_id: string;
  device_code: string;
  tables: Partial<Record<SyncTableName, Record<string, unknown>[]>>;
  counts: Partial<Record<SyncTableName, number>>;
};

export type BackupStatus = { at: string; deviceCode: string; total: number; kind: "MANUAL" | "PRE_RESTORE" };

export async function createBackup(ctx: Pick<BusinessContext, "businessId" | "deviceCode">): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  const counts: BackupFile["counts"] = {};
  for (const name of SYNC_TABLES) {
    const rows = (await db.table(name).where("business_id").equals(ctx.businessId).toArray()) as Record<string, unknown>[];
    tables[name] = rows;
    counts[name] = rows.length;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: nowISO(),
    business_id: ctx.businessId,
    device_code: ctx.deviceCode,
    tables,
    counts,
  };
}

export const backupTotal = (backup: Pick<BackupFile, "counts">): number =>
  Object.values(backup.counts).reduce((a, n) => a + (n ?? 0), 0);

export function backupFileName(backup: Pick<BackupFile, "created_at">, kind: "yedek" | "geri-yukleme-oncesi" = "yedek"): string {
  const stamp = backup.created_at.slice(0, 16).replace("T", "-").replace(":", "");
  return `veltrio-${kind}-${stamp}.json`;
}

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; error: string };

/** Yüklenen dosyanın biçimini, sürümünü ve işletmesini doğrular; tanınmayan tabloları yok sayar. */
export function parseBackup(text: string, businessId: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Dosya okunamadı: geçerli bir yedek dosyası değil." };
  }
  const file = data as Partial<BackupFile> | null;
  if (!file || file.format !== BACKUP_FORMAT || typeof file.tables !== "object" || file.tables === null) {
    return { ok: false, error: "Bu dosya bir Veltrio yedeği değil." };
  }
  if (typeof file.version !== "number" || file.version > BACKUP_VERSION) {
    return { ok: false, error: "Yedek dosyası daha yeni bir sürümden; uygulamayı güncelleyin." };
  }
  if (file.business_id !== businessId) {
    return { ok: false, error: "Bu yedek başka bir işletmeye ait; geri yüklenemez." };
  }
  const tables: BackupFile["tables"] = {};
  const counts: BackupFile["counts"] = {};
  for (const name of SYNC_TABLES) {
    const rows = (file.tables as Record<string, unknown>)[name];
    if (!Array.isArray(rows)) continue;
    const valid = rows.filter(
      (r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string" && (r as { business_id?: unknown }).business_id === businessId
    );
    tables[name] = valid;
    counts[name] = valid.length;
  }
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: file.version,
      created_at: typeof file.created_at === "string" ? file.created_at : nowISO(),
      business_id: businessId,
      device_code: typeof file.device_code === "string" ? file.device_code : "?",
      tables,
      counts,
    },
  };
}

export type RestoreResult = { added: number; skipped: number; byTable: Partial<Record<SyncTableName, number>> };

/**
 * Yedekteki kayıtlardan cihazda olmayanları ekler ve sunucuya gönderilmek üzere
 * kuyruğa alır (ekleme idempotenttir; sunucuda zaten varsa yok sayılır). Ana kayıtlar
 * önce eklenir. Var olan kayıtların üzerine yazılmaz.
 */
export async function restoreBackup(ctx: BusinessContext, backup: BackupFile): Promise<RestoreResult> {
  const names = (Object.keys(backup.tables) as SyncTableName[]).sort((a, b) => pushRank(a) - pushRank(b));
  const result: RestoreResult = { added: 0, skipped: 0, byTable: {} };

  for (const name of names) {
    const rows = backup.tables[name] ?? [];
    if (rows.length === 0) continue;
    await db.transaction("rw", db.table(name), db.sync_queue, async () => {
      for (const row of rows) {
        const id = row.id as string;
        if (await db.table(name).get(id)) {
          result.skipped++;
          continue;
        }
        await db.table(name).put(row);
        await enqueue(name, id, "INSERT", row, ctx.deviceCode);
        result.added++;
        result.byTable[name] = (result.byTable[name] ?? 0) + 1;
      }
    });
  }

  await writeAuditLog({
    businessId: ctx.businessId,
    entityType: "backups",
    entityId: ctx.businessId,
    action: "RESTORE",
    deviceCode: ctx.deviceCode,
    actorId: ctx.actorId,
    reason: "Yedekten geri yükleme",
    newValue: { added: result.added, skipped: result.skipped, backup_created_at: backup.created_at },
  });
  return result;
}

export function readLastBackup(storage: Storage): BackupStatus | null {
  try {
    const raw = storage.getItem(LAST_BACKUP_KEY);
    return raw ? (JSON.parse(raw) as BackupStatus) : null;
  } catch {
    return null;
  }
}

export function writeLastBackup(storage: Storage, status: BackupStatus): void {
  try {
    storage.setItem(LAST_BACKUP_KEY, JSON.stringify(status));
  } catch {
    // Depolama kapalıysa durum gösterilemez; yedek dosyası yine de alınmıştır.
  }
}

/** Yedek alındığını audit log'a yazar (veri dışa aktarma kritik işlemdir). */
export async function logBackup(ctx: BusinessContext, backup: BackupFile, kind: BackupStatus["kind"]): Promise<void> {
  await writeAuditLog({
    businessId: ctx.businessId,
    entityType: "backups",
    entityId: ctx.businessId,
    action: "CREATE",
    deviceCode: ctx.deviceCode,
    actorId: ctx.actorId,
    reason: kind === "PRE_RESTORE" ? "Geri yükleme öncesi yedek" : "Elle yedek alındı",
    newValue: { total: backupTotal(backup), created_at: backup.created_at },
  });
}
