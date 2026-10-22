import { calcDocument, calcLine, distributeAmount, lineGross, type LineResult } from "@/lib/calc";
import type { TaxMode } from "@/types";

export type TotalsLineInput = {
  quantity: number;
  /** kuruş */
  unitPriceKurus: number;
  /** satırın kendi indirimi (toplam), kuruş */
  discountKurus?: number;
  taxMode: TaxMode;
  taxRate: number;
};

export type ComputedLine = {
  /** Satır indirimi + belge indiriminden payına düşen (kuruş) */
  discountKurus: number;
  result: LineResult;
};

export type ComputedSale = {
  lines: ComputedLine[];
  totals: { subtotal: number; discountTotal: number; taxTotal: number; total: number };
};

/**
 * Satış tutarlarını hesaplar (kuruş). Belge geneli indirim, satırların
 * indirim sonrası tutarına orantılı dağıtılır ve satır indirimine eklenir;
 * hiçbir kuruş kaybolmaz. Hem servis hem ekran önizlemesi bunu kullanır, böylece
 * gösterilen toplam ile kaydedilen toplam aynıdır. Geçersiz girdide `Error` fırlatır.
 */
export function computeSaleTotals(lines: TotalsLineInput[], documentDiscountKurus = 0): ComputedSale {
  if (!Number.isInteger(documentDiscountKurus) || documentDiscountKurus < 0) {
    throw new Error("Belge indirimi sıfır veya daha büyük olmalıdır.");
  }

  const weights = lines.map((l) => {
    const own = l.discountKurus ?? 0;
    const gross = lineGross(l.unitPriceKurus, l.quantity);
    if (!Number.isInteger(own) || own < 0 || own > gross) {
      throw new Error("İndirim satır tutarından büyük veya negatif olamaz.");
    }
    return gross - own;
  });
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (documentDiscountKurus > weightSum) throw new Error("Belge indirimi satış tutarından büyük olamaz.");
  const shares = documentDiscountKurus > 0 ? distributeAmount(weights, documentDiscountKurus) : weights.map(() => 0);

  const computed = lines.map((l, i) => {
    const discountKurus = (l.discountKurus ?? 0) + shares[i];
    const result = calcLine({
      unitPrice: l.unitPriceKurus,
      quantity: l.quantity,
      discount: discountKurus,
      taxMode: l.taxMode,
      taxRate: l.taxRate,
    });
    return { discountKurus, result };
  });

  const doc = calcDocument(computed.map((c) => c.result));
  return {
    lines: computed,
    totals: { subtotal: doc.subtotal, discountTotal: doc.discountTotal, taxTotal: doc.taxTotal, total: doc.total },
  };
}
