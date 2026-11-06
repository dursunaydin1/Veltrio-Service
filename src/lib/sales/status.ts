import type { Sale } from "@/lib/db";

/** Satış durum adları ve rozet renkleri; liste, detay, müşteri geçmişi ve raporlar ortak kullanır (K-107). */
export const SALE_STATUS_LABEL: Record<Sale["status"], string> = {
  DRAFT: "Taslak",
  FINAL: "Tamamlandı",
  CANCELLED: "İptal edildi",
};

export const SALE_STATUS_BADGE: Record<Sale["status"], string> = {
  DRAFT: "badge-yellow",
  FINAL: "badge-green",
  CANCELLED: "badge-red",
};
