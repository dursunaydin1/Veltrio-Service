import { APPEND_ONLY_SYNC_TABLES } from "@/lib/sync/tables";
import type { SyncTableName } from "@/lib/sync/tables";
import type { SyncContext } from "@/lib/sync/server";

export type PushItem = {
  id: string;
  table_name: SyncTableName;
  record_id: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  payload: Record<string, unknown>;
};

export type PushResult = {
  id: string;
  success: boolean;
  /** true: kayıt başka bir cihazda değişmiş; kuyrukta CONFLICT olarak bekler */
  conflict?: boolean;
  error?: string;
};

type ApplyContext = Pick<SyncContext, "supabase" | "businessId">;

const UNIQUE_VIOLATION = "23505";

/**
 * Kuyruktaki tek bir değişikliği sunucuya uygular.
 *
 * INSERT : yalnızca ekler. Aynı kimlik zaten varsa önceki deneme başarılı
 *          olmuştur (idempotent) → başarı; var olan kaydın üzerine YAZILMAZ,
 *          çünkü kayıt arada başka cihazda güncellenmiş olabilir.
 * UPDATE : yalnızca payload.version sunucudaki sürümle aynıysa uygulanır.
 *          Aksi halde çakışmadır (sessiz ezme yok — AC-026, FR-021).
 * DELETE : kayda göre siler.
 */
export async function applyPushItem(
  context: ApplyContext,
  item: PushItem
): Promise<PushResult> {
  const { supabase, businessId } = context;

  if (item.payload.id !== item.record_id) {
    return fail(item, "Kayıt kimlikleri eşleşmiyor.");
  }
  if (item.payload.business_id !== businessId) {
    return fail(item, "İşletme kapsamı eşleşmiyor.");
  }
  if (APPEND_ONLY_SYNC_TABLES.has(item.table_name) && item.operation !== "INSERT") {
    return fail(item, "Hareket kayıtları yalnızca eklenebilir.");
  }

  const table = supabase.from(item.table_name);

  if (item.operation === "DELETE") {
    const { error } = await table
      .delete()
      .eq("id", item.record_id)
      .eq("business_id", businessId);
    return error ? fail(item, error.message) : ok(item);
  }

  // version sunucuda yönetilir: eklemede varsayılan 1, güncellemede tetikleyici artırır.
  const { version, ...row } = item.payload;

  if (item.operation === "INSERT") {
    const { error } = await table.insert(row);
    if (!error) return ok(item);
    if (error.code !== UNIQUE_VIOLATION) return fail(item, error.message);

    const { data: existing, error: lookupError } = await supabase
      .from(item.table_name)
      .select("id")
      .eq("id", item.record_id)
      .eq("business_id", businessId)
      .maybeSingle();
    if (lookupError) return fail(item, lookupError.message);
    // Kimlik başka bir kayıtla değil, aynı kayıtla çakışıyorsa → daha önce eklenmiş.
    return existing ? ok(item) : fail(item, error.message);
  }

  // UPDATE
  if (!Number.isInteger(version)) {
    return fail(item, "Güncelleme için kayıt sürümü (version) gereklidir.");
  }

  const { data: updated, error: updateError } = await table
    .update(row)
    .eq("id", item.record_id)
    .eq("business_id", businessId)
    .eq("version", version as number)
    .select("id");
  if (updateError) return fail(item, updateError.message);
  if (updated && updated.length > 0) return ok(item);

  const { data: current, error: currentError } = await supabase
    .from(item.table_name)
    .select("id")
    .eq("id", item.record_id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (currentError) return fail(item, currentError.message);

  return {
    id: item.id,
    success: false,
    conflict: true,
    error: current
      ? "Kayıt başka bir cihazda değiştirilmiş (sürüm farkı)."
      : "Kayıt sunucuda bulunamadı (başka bir cihazda silinmiş olabilir).",
  };
}

function ok(item: PushItem): PushResult {
  return { id: item.id, success: true };
}

function fail(item: PushItem, error: string): PushResult {
  return { id: item.id, success: false, error };
}
