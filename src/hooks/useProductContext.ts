"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/stores/session";
import type { ProductContext } from "@/lib/products/service";

/**
 * Ürün işlemleri için işletme, cihaz ve kullanıcı bilgisi.
 * Oturum veya cihaz henüz yüklenmediyse null döner.
 */
export function useProductContext(): ProductContext | null {
  const businessId = useSessionStore((s) => s.business?.id);
  const deviceCode = useSessionStore((s) => s.device?.device_code);
  const actorId = useSessionStore((s) => s.user?.id);

  return useMemo(
    () => (businessId && deviceCode ? { businessId, deviceCode, actorId } : null),
    [businessId, deviceCode, actorId]
  );
}
