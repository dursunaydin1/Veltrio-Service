import { APPEND_ONLY_SYNC_TABLES, isSyncTableName } from "@/lib/sync/tables";
import type { SyncTableName } from "@/lib/sync/tables";
import { getSyncContext } from "@/lib/sync/server";

type PushItem = {
  id: string;
  table_name: SyncTableName;
  record_id: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  payload: Record<string, unknown>;
};

function isPushItem(value: unknown): value is PushItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const tableName = item.table_name;
  return (
    typeof item.id === "string" &&
    typeof item.record_id === "string" &&
    isSyncTableName(tableName) &&
    (item.operation === "INSERT" ||
      item.operation === "UPDATE" ||
      item.operation === "DELETE") &&
    !!item.payload &&
    typeof item.payload === "object" &&
    !Array.isArray(item.payload)
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000) {
    return Response.json({ error: "Eşitleme paketi çok büyük." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Geçersiz JSON isteği." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json(
      { error: "Eşitleme isteğinde en fazla 100 kayıt gönderilebilir." },
      { status: 400 }
    );
  }

  const inputItems = (body as Record<string, unknown>).items;
  if (!Array.isArray(inputItems) || inputItems.length > 100) {
    return Response.json(
      { error: "Eşitleme isteğinde en fazla 100 kayıt gönderilebilir." },
      { status: 400 }
    );
  }

  const input = body as { deviceCode?: unknown; items: unknown[] };
  const auth = await getSyncContext(input.deviceCode);
  if (auth.response) return auth.response;

  if (!input.items.every(isPushItem)) {
    return Response.json({ error: "Eşitleme paketinde geçersiz kayıt var." }, { status: 400 });
  }

  const { context } = auth;
  const results: Array<{ id: string; success: boolean; error?: string }> = [];

  for (const item of input.items) {
    if (item.payload.id !== item.record_id) {
      results.push({ id: item.id, success: false, error: "Kayıt kimlikleri eşleşmiyor." });
      continue;
    }
    if (item.payload.business_id !== context.businessId) {
      results.push({ id: item.id, success: false, error: "İşletme kapsamı eşleşmiyor." });
      continue;
    }
    if (
      APPEND_ONLY_SYNC_TABLES.has(item.table_name) &&
      item.operation !== "INSERT"
    ) {
      results.push({
        id: item.id,
        success: false,
        error: "Hareket kayıtları yalnızca eklenebilir.",
      });
      continue;
    }

    const table = context.supabase.from(item.table_name);
    let errorMessage: string | null = null;

    if (item.operation === "DELETE") {
      const { error } = await table
        .delete()
        .eq("id", item.record_id)
        .eq("business_id", context.businessId);
      errorMessage = error?.message ?? null;
    } else if (APPEND_ONLY_SYNC_TABLES.has(item.table_name)) {
      const { error } = await table.insert(item.payload);
      if (error?.code === "23505") {
        const { data: existing, error: lookupError } = await table
          .select("id")
          .eq("id", item.record_id)
          .eq("business_id", context.businessId)
          .maybeSingle();
        errorMessage = lookupError?.message ?? (existing ? null : error.message);
      } else {
        errorMessage = error?.message ?? null;
      }
    } else {
      const { error } = await table.upsert(item.payload, { onConflict: "id" });
      errorMessage = error?.message ?? null;
    }

    results.push(
      errorMessage
        ? { id: item.id, success: false, error: errorMessage }
        : { id: item.id, success: true }
    );
  }

  return Response.json({ results });
}
