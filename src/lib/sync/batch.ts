/**
 * Gönderim paketleri (K-104). Paket hem kayıt sayısıyla hem boyutla sınırlanır: fotoğraflı
 * kayıtlar (JPEG data URL, ~150-300 KB) aynı pakete çok düşerse sunucu sınırı aşılır ve
 * paketin tamamı reddedilirdi. Sınırdan büyük tek kayıt kendi başına gider.
 */

export const MAX_BATCH_ITEMS = 100;
/** İstemci paket hedefi; sunucu sınırının (`MAX_PUSH_BODY_BYTES`) altında kalır */
export const MAX_BATCH_BYTES = 900_000;
/** Sunucunun kabul ettiği en büyük gövde (Vercel işlev sınırı 4,5 MB'ın altında) */
export const MAX_PUSH_BODY_BYTES = 4_000_000;

const encoder = new TextEncoder();

export function jsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

/** Sırayı koruyarak paketlere böler. */
export function batchBySize<T>(
  items: readonly T[],
  maxItems = MAX_BATCH_ITEMS,
  maxBytes = MAX_BATCH_BYTES,
  size: (item: T) => number = jsonBytes
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const itemBytes = size(item);
    if (current.length > 0 && (current.length >= maxItems || bytes + itemBytes > maxBytes)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += itemBytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** İndirme sayfası hedefi: Vercel yanıt sınırının (4,5 MB) güvenli altında */
export const MAX_PULL_PAGE_BYTES = 3_000_000;

/**
 * Baştan, toplam boyutu `maxBytes`ı aşmayan en uzun kısmı verir; en az bir kayıt her zaman alınır
 * (yoksa büyük tek kayıt indirmeyi sonsuza dek durdururdu).
 */
export function takeWithinBytes<T>(items: readonly T[], maxBytes = MAX_PULL_PAGE_BYTES, size: (item: T) => number = jsonBytes): T[] {
  let bytes = 0;
  let count = 0;
  for (const item of items) {
    bytes += size(item);
    if (count > 0 && bytes > maxBytes) break;
    count += 1;
  }
  return items.slice(0, count);
}
