import { calcLine, toKurus } from "@/lib/calc";

/**
 * Sunucuda satır toplamı doğrulaması (Adım 1.9, AC-026): istemci ve sunucu aynı
 * hesaplama modülünü (`calcLine`) kullanır. Gelen satırın `line_total` değeri,
 * birim fiyat / miktar / indirim / vergi alanlarından yeniden hesaplanan tutarla
 * kuruşu kuruşuna aynı olmalıdır; değilse kayıt reddedilir ve nedeni bildirilir.
 */

type Spec = { price: string; discount: string };

const LINE_TABLES: Record<string, Spec> = {
  sale_items: { price: "unit_price_snapshot", discount: "discount_amount" },
  purchase_items: { price: "unit_price", discount: "line_discount" },
  service_operations: { price: "unit_price", discount: "discount_amount" },
  service_parts: { price: "unit_price_snapshot", discount: "discount_amount" },
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** Doğrulanacak tablo değilse veya hesap için gereken alanlar yoksa (fiyatı belirsiz satır, kısmi güncelleme) null döner. */
export function verifyLineTotal(table: string, payload: Record<string, unknown>): string | null {
  const spec = LINE_TABLES[table];
  if (!spec) return null;
  if (payload.price_pending === true) return null;

  const price = num(payload[spec.price]);
  const quantity = num(payload.quantity);
  const total = num(payload.line_total);
  const rate = num(payload.tax_rate);
  const mode = payload.tax_mode;
  if (price === null || quantity === null || total === null || rate === null) return null;
  if (mode !== "INCLUSIVE" && mode !== "EXCLUSIVE" && mode !== "NONE") return null;
  const discount = num(payload[spec.discount]) ?? 0;

  let expected: number;
  try {
    expected = calcLine({
      unitPrice: toKurus(price),
      quantity,
      discount: toKurus(discount),
      taxMode: mode,
      taxRate: rate,
    }).total;
  } catch {
    return "Satır tutarı hesaplanamadı (geçersiz fiyat, miktar, indirim veya vergi).";
  }
  if (expected !== toKurus(total)) {
    return `Satır toplamı hesaplanandan farklı (gelen ${total}, hesaplanan ${(expected / 100).toFixed(2)}).`;
  }
  return null;
}
