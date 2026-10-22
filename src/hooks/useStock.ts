"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useSessionStore } from "@/stores/session";
import { EMPTY_BALANCE, getBalances, getProductBalance, type StockBalance } from "@/lib/stock/ledger";
import type { StockContext } from "@/lib/stock/service";

/** Stok işlemleri için işletme, cihaz, kullanıcı ve negatif stok ayarı. */
export function useStockContext(): StockContext | null {
  const businessId = useSessionStore((s) => s.business?.id);
  const deviceCode = useSessionStore((s) => s.device?.device_code);
  const actorId = useSessionStore((s) => s.user?.id);
  const allowNegativeStock = useSessionStore((s) => s.business?.settings?.allow_negative_stock);

  return useMemo(
    () =>
      businessId && deviceCode
        ? { businessId, deviceCode, actorId, allowNegativeStock: allowNegativeStock === true }
        : null,
    [businessId, deviceCode, actorId, allowNegativeStock]
  );
}

/** Tüm ürünlerin bakiyesi (hareket defterinden, canlı). */
export function useStockBalances(): Map<string, StockBalance> | undefined {
  const businessId = useSessionStore((s) => s.business?.id);
  return useLiveQuery(
    () => (businessId ? getBalances(businessId) : new Map<string, StockBalance>()),
    [businessId]
  );
}

/** Tek ürünün bakiyesi (hareket defterinden, canlı). */
export function useProductBalance(productId: string): StockBalance {
  return useLiveQuery(() => getProductBalance(productId), [productId]) ?? EMPTY_BALANCE;
}
