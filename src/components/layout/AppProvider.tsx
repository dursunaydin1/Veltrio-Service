"use client";

import { useAuthSync, useOnlineStatus } from "@/hooks/useAuth";

/**
 * Uygulama genelinde hook'ları tek yerden başlatır.
 * Root layout'ta <body> içine sarılmalıdır.
 *
 * Kullanım:
 *   <AppProvider>{children}</AppProvider>
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  useAuthSync();
  useOnlineStatus();
  return <>{children}</>;
}
