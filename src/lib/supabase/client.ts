import { createBrowserClient } from "@supabase/ssr";

/**
 * Tarayıcı taraflı Supabase client.
 * React component ve hook'larında kullanılır.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
