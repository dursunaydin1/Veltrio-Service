"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/stores/session";
import { DEFAULT_APPROVAL_THRESHOLD, type ServiceContext } from "@/lib/services/service";

/**
 * Servis işlemleri için bağlam: işletme/cihaz/kullanıcı + işletme ayarları
 * (onay eşiği, negatif stok). Oturum veya cihaz yüklenmediyse null döner.
 */
export function useServiceContext(): ServiceContext | null {
  const businessId = useSessionStore((s) => s.business?.id);
  const deviceCode = useSessionStore((s) => s.device?.device_code);
  const actorId = useSessionStore((s) => s.user?.id);
  const threshold = useSessionStore((s) => s.business?.settings?.service_approval_threshold);
  const allowNegative = useSessionStore((s) => s.business?.settings?.allow_negative_stock);

  return useMemo(
    () =>
      businessId && deviceCode
        ? {
            businessId,
            deviceCode,
            actorId,
            approvalThreshold: typeof threshold === "number" ? threshold : DEFAULT_APPROVAL_THRESHOLD,
            allowNegativeStock: allowNegative === true,
          }
        : null,
    [businessId, deviceCode, actorId, threshold, allowNegative]
  );
}
