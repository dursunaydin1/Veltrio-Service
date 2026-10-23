"use client";

import { useAuthSync, useOnlineStatus } from "@/hooks/useAuth";
import { usePaymentDueReminders } from "@/hooks/usePaymentDueReminders";
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
  usePaymentDueReminders();
  return <>{children}</>;
}
