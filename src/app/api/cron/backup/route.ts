import { createClient } from "@supabase/supabase-js";
import { backupAllBusinesses } from "@/lib/backup/server";

/**
 * Günlük otomatik yedek görevi (Adım 1.11). Zamanlayıcı (ör. Vercel Cron, `vercel.json`)
 * her gün `Authorization: Bearer <CRON_SECRET>` ile çağırır. Gerekli ortam değişkenleri:
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (yalnızca sunucuda, gizli), CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !serviceKey || !url) {
    return Response.json({ error: "Yedek görevi yapılandırılmamış." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  try {
    const results = await backupAllBusinesses(client);
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Yedek alınamadı." }, { status: 500 });
  }
}
