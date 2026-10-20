import { getSyncContext } from "@/lib/sync/server";

const PAGE_SIZE = 500;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? "0";
  const deviceCode = url.searchParams.get("deviceCode");

  if (!/^\d+$/.test(cursor)) {
    return Response.json({ error: "Eşitleme imleci geçersiz." }, { status: 400 });
  }

  const auth = await getSyncContext(deviceCode);
  if (auth.response) return auth.response;

  const { data, error } = await auth.context.supabase
    .from("sync_changes")
    .select("id::text, table_name, record_id, operation, record, changed_at")
    .eq("business_id", auth.context.businessId)
    .gt("id", cursor)
    .order("id", { ascending: true })
    .limit(PAGE_SIZE);

  if (error) {
    console.error("Eşitleme değişiklikleri alınamadı:", error.message);
    return Response.json({ error: "Eşitleme değişiklikleri alınamadı." }, { status: 500 });
  }

  const changes = data ?? [];
  return Response.json(
    {
      changes,
      nextCursor: changes.length ? changes[changes.length - 1].id : cursor,
      hasMore: changes.length === PAGE_SIZE,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
