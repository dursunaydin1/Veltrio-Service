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
  /** Numara çakışması nedeniyle sunucuda yeniden numaralandı */
  renumbered?: { from: string; to: string };
};

type ApplyContext = Pick<SyncContext, "supabase" | "businessId">;

const UNIQUE_VIOLATION = "23505";

/**
 * Sunucuda benzersiz olması gereken numara sütunları (işletme içinde). İki cihaz
 * aynı numarayı üretirse (ör. tarayıcı verisi silinip sayaç sıfırlanınca) kayıt
 * reddedilmez: sonuna `-R1`, `-R2`… eklenerek yeniden numaralanır ve audit log'a
 * yazılır (PRD §7.3, AC-016). Kayıt kimliği değişmez, ilişkiler bozulmaz.
 */
const NUMBER_COLUMNS: Partial<Record<string, string>> = {
  services: "document_no",
  sales: "document_no",
  purchases: "document_no",
  return_transactions: "document_no",
  machines: "internal_number",
  product_serial_units: "internal_number",
};
const MAX_RENUMBER_TRIES = 9;

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
    if (existing) return ok(item);

    // Kimlik yeni, ama numara başka bir kayıtta var → yeniden numarala.
    const column = NUMBER_COLUMNS[item.table_name];
    const original = column ? row[column] : undefined;
    if (!column || typeof original !== "string" || !original) return fail(item, error.message);
    for (let n = 1; n <= MAX_RENUMBER_TRIES; n++) {
      const renumbered = `${original}-R${n}`;
      const retry = await table.insert({ ...row, [column]: renumbered });
      if (!retry.error) {
        await supabase.from("audit_logs").insert({
          id: crypto.randomUUID(),
          business_id: businessId,
          entity_type: item.table_name,
          entity_id: item.record_id,
          action: "UPDATE",
          old_value: { [column]: original },
          new_value: { [column]: renumbered },
          changed_by_device: typeof row.created_by_device === "string" ? row.created_by_device : "SUNUCU",
          reason: "Numara çakışması: kayıt yeniden numaralandı",
        });
        return { id: item.id, success: true, renumbered: { from: original, to: renumbered } };
      }
      if (retry.error.code !== UNIQUE_VIOLATION) return fail(item, retry.error.message);
    }
    return fail(item, `${error.message} (yeniden numaralama başarısız)`);
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
