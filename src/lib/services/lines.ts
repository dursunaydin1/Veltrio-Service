import { toKurus } from "@/lib/calc";
import type { LineStatus } from "@/lib/db";

/**
 * Servis teklifi (işlem + parça satırları) hesapları — saf fonksiyonlar.
 *
 * Müşteri kararı satır başınadır (SR-006):
 *   PENDING  → henüz karar yok (toplama girer, onay bekler)
 *   APPROVED → onaylandı
 *   REJECTED / DEFERRED → toplama girmez (TC-004)
 */
export type LineLike = {
  /** TL, vergi dahil satır toplamı */
  line_total: number;
  status: LineStatus;
  /** Fiyatı henüz belirlenmemiş (SR-007) */
  price_pending?: boolean;
};

/** Faturalanan satır: reddedilen ve ertelenenler toplama girmez. */
export function isBilled(status: LineStatus): boolean {
  return status === "PENDING" || status === "APPROVED";
}

export type QuoteSummary = {
  /** Teklif toplamı (bekleyen + onaylı), kuruş */
  quote: number;
  /** Onaylanan satırların toplamı, kuruş */
  approved: number;
  /** Karar bekleyen satırların toplamı, kuruş */
  pending: number;
  /** Karar bekleyen satır sayısı (tutarı 0 olsa da) */
  pendingCount: number;
  /** Fiyatı henüz belirlenmemiş (reddedilmemiş) satır sayısı */
  unpriced: number;
};

export function summarizeLines(lines: LineLike[]): QuoteSummary {
  const summary: QuoteSummary = { quote: 0, approved: 0, pending: 0, pendingCount: 0, unpriced: 0 };
  for (const line of lines) {
    if (!isBilled(line.status)) continue;
    const kurus = toKurus(line.line_total);
    summary.quote += kurus;
    if (line.status === "APPROVED") summary.approved += kurus;
    else {
      summary.pending += kurus;
      summary.pendingCount += 1;
    }
    if (line.price_pending) summary.unpriced += 1;
  }
  return summary;
}

/**
 * Müşteri onayı gerekli mi? Teklif toplamı eşiği aşıyorsa (SR-004).
 * Eşik 0 ise ücretli her işte onay gerekir.
 */
export function approvalRequired(quoteKurus: number, thresholdTL: number): boolean {
  return quoteKurus > toKurus(thresholdTL);
}

/** Onay gereken serviste bekleyen (kararsız) satır varsa "İşlemde"ye geçilemez. */
export function needsApprovalBeforeWork(summary: QuoteSummary, thresholdTL: number): boolean {
  return approvalRequired(summary.quote, thresholdTL) && summary.pendingCount > 0;
}
