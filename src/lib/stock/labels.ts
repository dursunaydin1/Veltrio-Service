import type { StockMovementType } from "@/types";

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  OPENING: "Açılış stoğu",
  PURCHASE_IN: "Satın alma girişi",
  SALE_OUT: "Satış",
  SERVICE_USE: "Servis parçası",
  RETURN_IN: "Müşteri iadesi",
  RETURN_OUT: "Tedarikçiye iade",
  ADJUSTMENT_IN: "Düzeltme (artış)",
  ADJUSTMENT_OUT: "Düzeltme (azalış)",
  DAMAGED_IN: "Hasarlıya ayrıldı",
  DAMAGED_DISPOSE: "İmha / hurda",
  TRANSFER: "Aktarım",
  CANCEL_REVERSAL: "İptal ters kaydı",
};
