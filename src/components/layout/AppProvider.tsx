"use client";

import { useAuthSync, useOnlineStatus } from "@/hooks/useAuth";
import { useSync } from "@/hooks/useSync";

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
  useSync();
  return <>{children}</>;
}
