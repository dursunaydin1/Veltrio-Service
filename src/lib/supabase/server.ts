import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieOption = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Sunucu taraflı Supabase client (Server Components, Route Handlers).
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase yapılandırılmamış. .env.local dosyasını oluşturun (.env.local.example şablonuna bakın)."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieOption[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            );
          } catch {
            // Server Component'te set çağrısı ignore edilebilir
          }
        },
      },
    }
  );
}
