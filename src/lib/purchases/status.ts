import type { Purchase } from "@/lib/db";

/** Satın alma durum adları ve rozet renkleri (K-107). */
export const PURCHASE_STATUS_LABEL: Record<Purchase["status"], string> = {
  DRAFT: "Taslak",
  RECEIVED: "Teslim alındı",
  CANCELLED: "İptal edildi",
};

export const PURCHASE_STATUS_BADGE: Record<Purchase["status"], string> = {
  DRAFT: "badge-yellow",
  RECEIVED: "badge-green",
  CANCELLED: "badge-red",
};
