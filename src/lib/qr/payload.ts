/**
 * QR içeriği (Adım 3.4, FR-006): yalnızca değişmeyen kayıt kimliği ve adres taşır.
 * Fiyat, stok ve sahip gibi değişen bilgiler QR'a yazılmaz; okutulunca güncel
 * veri gösterilir (AC-035), bu yüzden etiketi yeniden basmak gerekmez.
 */

export type QrKind = "machine" | "product";

const PATHS: Record<QrKind, string> = { machine: "/machines/", product: "/products/" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function qrPath(kind: QrKind, id: string): string {
  return `${PATHS[kind]}${id}`;
}

export function qrUrl(origin: string, kind: QrKind, id: string): string {
  return `${origin.replace(/\/+$/, "")}${qrPath(kind, id)}`;
}

export type ScanResult = { ok: true; path: string; kind: QrKind } | { ok: false; reason: string };

/**
 * Okunan QR metnini uygulama içi bir yola çevirir. Yalnızca makine ve ürün
 * adresleri kabul edilir; başka bir alan adı olsa bile yol aynıysa güncel
 * uygulamada açılır (alan adı değişse eski etiketler çalışmaya devam eder).
 */
export function parseScan(text: string): ScanResult {
  const raw = text.trim();
  if (!raw) return { ok: false, reason: "QR boş okundu." };
  let pathname = raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      return { ok: false, reason: "QR içeriği geçerli bir adres değil." };
    }
  }
  for (const kind of Object.keys(PATHS) as QrKind[]) {
    if (!pathname.startsWith(PATHS[kind])) continue;
    const id = pathname.slice(PATHS[kind].length).split(/[/?#]/)[0];
    if (UUID.test(id)) return { ok: true, path: qrPath(kind, id.toLowerCase()), kind };
  }
  return { ok: false, reason: "Bu QR, makine veya ürün etiketi değil." };
}

/** Etiket boyutları (mm): QR + kısa kimlik / ürün adı + isteğe bağlı işletme adı. */
export const LABEL_SIZES = {
  SMALL: { label: "Küçük (40 × 30 mm)", width: 40, height: 30, qr: 22 },
  MEDIUM: { label: "Orta (50 × 40 mm)", width: 50, height: 40, qr: 28 },
  LARGE: { label: "Büyük (70 × 50 mm)", width: 70, height: 50, qr: 38 },
} as const;
export type LabelSizeId = keyof typeof LABEL_SIZES;
export const DEFAULT_LABEL_SIZE: LabelSizeId = "MEDIUM";

export function isLabelSizeId(value: unknown): value is LabelSizeId {
  return typeof value === "string" && value in LABEL_SIZES;
}
