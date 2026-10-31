/**
 * İstemci tarafında fotoğraf küçültme (FR-028): uzun kenar 1200 px'i geçmez,
 * JPEG olarak kaydedilir. Fotoğraf yerel veritabanında ve eşitlemede metin
 * (data URL) olarak taşındığı için boyut kısıtlıdır. K-054: 1600 → 1200 px; bir fotoğraf
 * ≈ 100-150 KB olur, ücretsiz Supabase planına 4-5 bin fotoğraf sığar. Eski fotoğraflar değişmez.
 */

export const MAX_EDGE = 1200;
export const JPEG_QUALITY = 0.7;
/** Küçültmeden sonra kabul edilen en büyük data URL uzunluğu (≈ 0,75 MB) */
export const MAX_DATA_URL_LENGTH = 1_000_000;

/** Oranı koruyarak en uzun kenarı `max`'a sığdırır; küçükse büyütmez. */
export function fitWithin(width: number, height: number, max: number = MAX_EDGE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new Error("Geçersiz görüntü boyutu.");
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Seçilen görsel dosyasını küçültüp JPEG data URL'e çevirir (yalnızca tarayıcıda). */
export async function resizeImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Lütfen bir görsel dosyası seçin.");
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Görsel işlenemedi.");
    context.drawImage(bitmap, 0, 0, width, height);
    const url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    if (url.length > MAX_DATA_URL_LENGTH) throw new Error("Fotoğraf küçültüldükten sonra hâlâ çok büyük.");
    return url;
  } finally {
    bitmap.close();
  }
}
