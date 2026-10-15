import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieOption = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Sunucu taraflı Supabase client (Server Components, Route Handlers).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
