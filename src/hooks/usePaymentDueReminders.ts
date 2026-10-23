"use client";

import { useEffect } from "react";
import { syncPaymentDueNotifications } from "@/lib/notifications/paymentDue";
import { useBusinessContext } from "@/hooks/useBusinessContext";

/**
 * Vade hatırlatmalarını açılışta, uygulamaya dönüldüğünde ve saatte bir günceller
 * (AC-038). Yeni olay yoksa hiçbir şey üretmez; aynı olay tekrarlanmaz.
 */
export function usePaymentDueReminders(): void {
  const ctx = useBusinessContext();
  const businessId = ctx?.businessId;
  const deviceCode = ctx?.deviceCode;

  useEffect(() => {
    if (!businessId || !deviceCode) return;
    const run = () => {
      syncPaymentDueNotifications({ businessId, deviceCode }).catch(() => {
        // Hatırlatma üretimi başarısız olsa da uygulama çalışmaya devam eder.
      });
    };
    run();
    window.addEventListener("focus", run);
    const timer = window.setInterval(run, 60 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", run);
      window.clearInterval(timer);
    };
  }, [businessId, deviceCode]);
}
