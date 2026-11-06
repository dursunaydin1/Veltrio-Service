import { isSyncTableName } from "@/lib/sync/tables";
import { applyPushItem, type PushItem, type PushResult } from "@/lib/sync/apply";
import { getSyncContext } from "@/lib/sync/server";
import { MAX_BATCH_ITEMS, MAX_PUSH_BODY_BYTES } from "@/lib/sync/batch";

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

const tooLarge = () => Response.json({ error: "Eşitleme paketi çok büyük." }, { status: 413 });

export async function POST(request: Request) {
  // Başlık eksik ya da yanlış olabilir: önce başlığa, sonra gövdenin gerçek boyutuna bakılır (K-104)
  if (Number(request.headers.get("content-length") ?? 0) > MAX_PUSH_BODY_BYTES) return tooLarge();
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_PUSH_BODY_BYTES) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Geçersiz JSON isteği." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Eşitleme isteği geçersiz." }, { status: 400 });
  }

  const inputItems = (body as Record<string, unknown>).items;
  if (!Array.isArray(inputItems) || inputItems.length > MAX_BATCH_ITEMS) {
    return Response.json(
      { error: `Eşitleme isteğinde en fazla ${MAX_BATCH_ITEMS} kayıt gönderilebilir.` },
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
  const results: PushResult[] = [];

  for (const item of input.items) {
    results.push(await applyPushItem(context, item));
  }

  return Response.json({ results });
}
