import { db } from "@/lib/db";
import { getPendingItems, markError, markSynced } from "@/lib/sync/queue";
import { isSyncTableName } from "@/lib/sync/tables";
import { useSessionStore } from "@/stores/session";
import { nowISO } from "@/lib/utils";
import type { SyncQueueItem } from "@/types";

type PushResult = { id: string; success: boolean; error?: string };
type PullChange = {
  id: string;
  table_name: string;
  record_id: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  record: Record<string, unknown> | null;
};

type PullResponse = {
  changes: PullChange[];
  nextCursor: string;
  hasMore: boolean;
};

export type SyncSummary = {
  pushed: number;
  pulled: number;
};

function cursorStorageKey(businessId: string, deviceCode: string): string {
  return `veltrio_sync_cursor:${businessId}:${deviceCode}`;
}

function getCursor(businessId: string, deviceCode: string): string {
  if (typeof window === "undefined") return "0";
  return window.localStorage.getItem(cursorStorageKey(businessId, deviceCode)) ?? "0";
}

function storeCursor(businessId: string, deviceCode: string, cursor: string): void {
  if (typeof window === "undefined") {
    throw new Error("Eşitleme imleci yalnızca tarayıcıda saklanabilir.");
  }
  window.localStorage.setItem(cursorStorageKey(businessId, deviceCode), cursor);
}

async function pushPending(
  items: SyncQueueItem[],
  businessId: string,
  deviceCode: string
): Promise<number> {
  const pending = items.filter(
    (item) => item.payload.business_id === businessId
  );
  if (pending.length === 0) return 0;

  let pushed = 0;
  for (let start = 0; start < pending.length; start += 100) {
    const batch = pending.slice(start, start + 100);
    const response = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode, items: batch }),
    });

    const body = (await response.json()) as {
      error?: string;
      results?: PushResult[];
    };
    if (!response.ok || !body.results) {
      throw new Error(body.error ?? "Eşitleme paketi gönderilemedi.");
    }

    const resultsById = new Map(body.results.map((result) => [result.id, result]));
    for (const item of batch) {
      const result = resultsById.get(item.id);
      if (!result) {
        await markError(item.id, "Sunucudan bu kayıt için sonuç alınamadı.");
      } else if (result.success) {
        await markSynced(item.id);
        pushed += 1;
      } else {
        await markError(item.id, result.error ?? "Kayıt eşitlenemedi.");
      }
    }
  }

  return pushed;
}

async function pullChanges(
  businessId: string,
  deviceCode: string
): Promise<number> {
  let cursor = getCursor(businessId, deviceCode);
  let pulled = 0;

  do {
    const query = new URLSearchParams({ cursor, deviceCode });
    const response = await fetch(`/api/sync/pull?${query.toString()}`);
    const body = (await response.json()) as PullResponse & { error?: string };
    if (!response.ok || !Array.isArray(body.changes) || !body.nextCursor) {
      throw new Error(body.error ?? "Sunucu değişiklikleri alınamadı.");
    }

    for (const change of body.changes) {
      if (!isSyncTableName(change.table_name)) {
        throw new Error(`Bilinmeyen eşitleme tablosu: ${change.table_name}`);
      }
      const table = db.table(change.table_name);
      if (change.operation === "DELETE") {
        await table.delete(change.record_id);
      } else if (change.record) {
        await table.put(change.record);
      } else {
        throw new Error(`Eşitleme kaydında içerik eksik: ${change.record_id}`);
      }
      pulled += 1;
    }

    cursor = body.nextCursor;
    storeCursor(businessId, deviceCode, cursor);
    if (!body.hasMore) break;
  } while (true);

  return pulled;
}

export async function syncNow(
  businessId: string,
  deviceCode: string
): Promise<SyncSummary> {
  if (!businessId || !deviceCode) {
    throw new Error("Eşitleme için işletme ve cihaz bilgisi gereklidir.");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Eşitleme için internet bağlantısı gereklidir.");
  }

  const queue = await getPendingItems();
  const pushed = await pushPending(queue, businessId, deviceCode);
  const pulled = await pullChanges(businessId, deviceCode);

  useSessionStore.getState().setLastSyncedAt(nowISO());
  return { pushed, pulled };
}
