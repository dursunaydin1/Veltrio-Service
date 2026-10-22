import { db } from "@/lib/db";
import {
  formatDocumentNo,
  isYearlyKind,
  type DocumentKind,
} from "@/lib/utils/id";
import { istanbulYear } from "@/lib/utils/date";

/**
 * Cihaz bazlı, kalıcı belge sayacı (PRD §7.3, Adım 1.6).
 *
 * Sayaç Dexie `counters` tablosunda tutulur; artış tek bir yazma işleminde
 * (transaction) yapıldığı için aynı tarayıcıdaki sekmeler arasında da
 * çakışmaz. Cihaz kodu numaranın içinde olduğundan, iki cihaz çevrimdışı
 * belge üretse bile numaralar farklı olur.
 *
 * Tarayıcı verisi silinirse sayaç sıfırlanır; aynı numara yeniden üretilirse
 * sunucudaki UNIQUE (business_id, document_no) kısıtı bunu yakalar.
 */
export async function nextDocumentNo(
  kind: DocumentKind,
  deviceCode: string,
  now: Date = new Date()
): Promise<string> {
  if (!deviceCode) {
    throw new Error("Belge numarası için cihaz kodu gereklidir.");
  }

  const year = istanbulYear(now);
  const key = `${kind}:${deviceCode}:${isYearlyKind(kind) ? year : "-"}`;

  const sequence = await db.transaction("rw", db.counters, async () => {
    const current = await db.counters.get(key);
    const next = (current?.last_value ?? 0) + 1;
    await db.counters.put({ key, last_value: next });
    return next;
  });

  return formatDocumentNo(kind, deviceCode, sequence, year);
}
