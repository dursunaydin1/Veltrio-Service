"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/stores/session";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { DEFAULT_APPROVAL_THRESHOLD, type ServiceContext } from "@/lib/services/service";

/**
 * Servis, satış ve stok işlemleri için bağlam: işletme bağlamı (`useBusinessContext`) + işletme
 * ayarları (onay eşiği, negatif stok). Oturum veya cihaz yüklenmediyse null döner.
 * İşletme / cihaz / kullanıcı bilgisi tek yerden okunur (K-108).
 */
export function useServiceContext(): ServiceContext | null {
  const base = useBusinessContext();
  const threshold = useSessionStore((s) => s.business?.settings?.service_approval_threshold);
  const tolerance = useSessionStore((s) => s.business?.settings?.service_approval_tolerance);
  const allowNegative = useSessionStore((s) => s.business?.settings?.allow_negative_stock);

  return useMemo(
    () =>
      base
        ? {
            ...base,
            approvalThreshold: typeof threshold === "number" ? threshold : DEFAULT_APPROVAL_THRESHOLD,
            approvalTolerance: typeof tolerance === "number" ? tolerance : 0,
            allowNegativeStock: allowNegative === true,
          }
        : null,
    [base, threshold, tolerance, allowNegative]
  );
}
