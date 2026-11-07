/** Servis kalemi etiketleri: işlem / parça satırları ve formlar ortak kullanır (K-109). */
import type { LineStatus, PartSourceType } from "@/lib/db";

export const STATUS_LABEL: Record<LineStatus, string> = {
  PENDING: "Karar bekliyor",
  APPROVED: "Onaylı",
  REJECTED: "Reddedildi",
  DEFERRED: "Ertelendi",
};

export const STATUS_BADGE: Record<LineStatus, string> = {
  PENDING: "badge-yellow",
  APPROVED: "badge-green",
  REJECTED: "badge-red",
  DEFERRED: "badge-gray",
};

export const SOURCE_LABEL: Record<PartSourceType, string> = {
  STOCK_PRODUCT: "Stoktan ürün",
  CUSTOMER_SUPPLIED: "Müşterinin getirdiği parça",
  NON_STOCK_PURCHASE: "Stok dışı alım",
  OTHER: "Diğer",
};

export const SUPPLY_LABEL = { IN_STOCK: "Stokta", TO_ORDER: "Sipariş edilecek", ORDERED: "Sipariş verildi", ARRIVED: "Geldi" } as const;
