import { db } from "@/lib/db";
import { getPendingItems, markConflict, markError, markSynced } from "@/lib/sync/queue";
import { isSyncTableName } from "@/lib/sync/tables";
import { batchBySize } from "@/lib/sync/batch";
import { useSessionStore } from "@/stores/session";
import { nowISO } from "@/lib/utils";
import { dataScope, FULL_DATA_SCOPE } from "@/lib/auth/permissions";
import type { SyncQueueItem } from "@/types";

type PushResult = { id: string; success: boolean; conflict?: boolean; error?: string };
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
  /** Sunucu kayıtları izne göre süzdü mü (029 uygulanmış) */
  filtered?: boolean;
};

/**
 * Sunucu 403 döndürdüyse cihaz iptal edilmiş olabilir: cihaz denetimini tetikler
 * (iptal edilmişse yerel veri silinir, AC-045).
 */
function requestDeviceCheck(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("veltrio:device-check"));
}

export type SyncSummary = {
  pushed: number;
  pulled: number;
  conflicts: number;
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

function scopeStorageKey(businessId: string, deviceCode: string): string {
  return `veltrio_sync_scope:${businessId}:${deviceCode}`;
}

/**
 * Cihazdaki veri kapsamı izinle değiştiyse her şey baştan indirilir (K-120): sunucu gizli
 * kaydı silme olarak, maliyetsiz kaydı maliyet alanı olmadan gönderir; `put` kaydın
 * tamamını değiştirdiği için eski bilgi cihazda kalmaz. Kapsamı kayıtlı olmayan eski
 * cihazın verisi tamdır: patronsa yeniden indirmeye gerek yoktur.
 */
export function scopeNeedsRepull(stored: string | null, current: string | null): boolean {
  if (current === null) return false;
  if (stored === null) return current !== FULL_DATA_SCOPE;
  return stored !== current;
}

/**
 * Kendini onarma: imleç ilerlemiş (daha önce veri inmiş) ama cihazda bu işletmeye ait hiç
 * müşteri, servis veya ürün yoksa yerel veri bir şekilde kaybolmuştur (ör. tarayıcı veriyi
 * temizledi, imleç kaldı). Bu durumda imleç sıfırlanır ve her şey baştan indirilir.
 * Kayıtlar `put` ile yazıldığı için kopya oluşmaz.
 */
export async function shouldRepullEverything(businessId: string, cursor: string): Promise<boolean> {
  if (cursor === "0") return false;
  const [customers, services, products] = await Promise.all([
    db.customers.where("business_id").equals(businessId).count(),
    db.services.where("business_id").equals(businessId).count(),
    db.products.where("business_id").equals(businessId).count(),
  ]);
  return customers + services + products === 0;
}

async function pushPending(
  items: SyncQueueItem[],
  businessId: string,
  deviceCode: string
): Promise<{ pushed: number; conflicts: number }> {
  const pending = items.filter(
    (item) => item.payload.business_id === businessId
  );
  if (pending.length === 0) return { pushed: 0, conflicts: 0 };

  let pushed = 0;
  let conflicts = 0;
  // Kayıt sayısı ve boyutla sınırlı paketler (K-104): fotoğraflı kayıtlar sınırı aşmaz
  for (const batch of batchBySize(pending)) {
    const response = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode, items: batch }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      results?: PushResult[];
    };
    if (!response.ok || !body.results) {
      // Paketin kendisi reddedildi (bozuk / çok büyük): bu paketin kayıtları deneme sayacına
      // işlenir (5 denemede HATA'ya düşer, görünür olur); sonraki paketler gönderilmeye devam eder.
      if (response.status === 400 || response.status === 413) {
        const message = body.error ?? `Eşitleme paketi reddedildi (${response.status}).`;
        for (const item of batch) await markError(item.id, message);
        continue;
      }
      // Oturum, cihaz ya da geçici sunucu sorunu bütün kuyruğu ilgilendirir: dur, sonra yeniden denenir
      if (response.status === 403) requestDeviceCheck();
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
      } else if (result.conflict) {
        await markConflict(item.id, result.error);
        conflicts += 1;
      } else {
        await markError(item.id, result.error ?? "Kayıt eşitlenemedi.");
      }
    }
  }

  return { pushed, conflicts };
}

async function pullChanges(
  businessId: string,
  deviceCode: string
): Promise<number> {
  let cursor = getCursor(businessId, deviceCode);
  if (await shouldRepullEverything(businessId, cursor)) cursor = "0";
  const scope = dataScope(useSessionStore.getState().user);
  const scopeKey = scopeStorageKey(businessId, deviceCode);
  if (scopeNeedsRepull(window.localStorage.getItem(scopeKey), scope)) cursor = "0";
  let filtered = true;
  let pulled = 0;
  // Baştan indirme sürerken ekranlar "boş" yerine "yükleniyor" der
  const { setPullingAll } = useSessionStore.getState();
  if (cursor === "0") setPullingAll(true);

  try {
    do {
      const query = new URLSearchParams({ cursor, deviceCode });
      const response = await fetch(`/api/sync/pull?${query.toString()}`);
      const body = (await response.json()) as PullResponse & { error?: string };
      if (!response.ok || !Array.isArray(body.changes) || !body.nextCursor) {
        if (response.status === 403) requestDeviceCheck();
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

      if (body.filtered !== true) filtered = false;
      cursor = body.nextCursor;
      storeCursor(businessId, deviceCode, cursor);
      if (!body.hasMore) break;
    } while (true);
    // Kapsam ancak indirme bitince ve sunucu süzdüyse kaydedilir; yarıda kalırsa ya da
    // sunucu henüz süzmüyorsa bir sonraki eşitleme yeniden değerlendirir
    if (scope !== null && filtered) window.localStorage.setItem(scopeKey, scope);
  } finally {
    setPullingAll(false);
  }

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
  const { pushed, conflicts } = await pushPending(queue, businessId, deviceCode);
  const pulled = await pullChanges(businessId, deviceCode);

  useSessionStore.getState().setLastSyncedAt(nowISO());
  return { pushed, pulled, conflicts };
}
