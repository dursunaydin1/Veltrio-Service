"use client";

import { useEffect } from "react";
import { syncPaymentDueNotifications } from "@/lib/notifications/paymentDue";
import { syncIssueNotifications } from "@/lib/notifications/center";
import { syncStockNotifications } from "@/lib/notifications/stockAlerts";
import { syncServiceNotifications } from "@/lib/notifications/serviceReminders";
import { useSessionStore } from "@/stores/session";
import { useBusinessContext } from "@/hooks/useBusinessContext";

/**
 * Vade ve servis hatırlatmalarını açılışta, uygulamaya dönüldüğünde ve saatte bir günceller
 * (AC-038). Yeni olay yoksa hiçbir şey üretmez; aynı olay tekrarlanmaz.
 */
export function useReminders(): void {
  const ctx = useBusinessContext();
  const businessId = ctx?.businessId;
  const deviceCode = ctx?.deviceCode;
  const reminderDays = useSessionStore((s) => s.business?.settings?.default_service_reminder_days);

  useEffect(() => {
    if (!businessId || !deviceCode) return;
    const run = () => {
      // Hatırlatma üretimi başarısız olsa da uygulama çalışmaya devam eder.
      syncPaymentDueNotifications({ businessId, deviceCode }).catch(() => undefined);
      syncServiceNotifications({ businessId, deviceCode }, { reminderDays }).catch(() => undefined);
      syncStockNotifications({ businessId, deviceCode }).catch(() => undefined);
      syncIssueNotifications({ businessId, deviceCode }).catch(() => undefined);
    };
    run();
    window.addEventListener("focus", run);
    const timer = window.setInterval(run, 60 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", run);
      window.clearInterval(timer);
    };
  }, [businessId, deviceCode, reminderDays]);
}
