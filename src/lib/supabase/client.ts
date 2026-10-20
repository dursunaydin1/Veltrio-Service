import { createBrowserClient } from "@supabase/ssr";

/**
 * Tarayıcı taraflı Supabase client.
 * React component ve hook'larında kullanılır.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase yapılandırılmamış. .env.local dosyasını oluşturun."
    );
  }
  return createBrowserClient(url, key);
}
