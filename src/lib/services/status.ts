/**
 * Servis durum makinesi (PRD §6.1, Adım 3.7). Saf fonksiyonlar; veritabanına
 * dokunmaz, böylece iş kuralları kolayca test edilir.
 */
export const SERVICE_STATUSES = [
  "RECEIVED",
  "WAITING_DIAGNOSIS",
  "DIAGNOSED",
  "WAITING_CUSTOMER_APPROVAL",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "COMPLETED",
  "DELIVERED",
  "CANCELLED",
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  RECEIVED: "Kabul edildi",
  WAITING_DIAGNOSIS: "Teşhis bekleniyor",
  DIAGNOSED: "Teşhis tamamlandı",
  WAITING_CUSTOMER_APPROVAL: "Müşteri onayı bekleniyor",
  IN_PROGRESS: "İşlemde",
  WAITING_PARTS: "Parça bekleniyor",
  COMPLETED: "İş tamamlandı",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal edildi",
};

/** İzin verilen sonraki durumlar. */
export const SERVICE_TRANSITIONS: Record<ServiceStatus, readonly ServiceStatus[]> = {
  RECEIVED: ["WAITING_DIAGNOSIS", "DIAGNOSED", "CANCELLED"],
  WAITING_DIAGNOSIS: ["DIAGNOSED", "CANCELLED"],
  DIAGNOSED: ["WAITING_CUSTOMER_APPROVAL", "IN_PROGRESS", "WAITING_PARTS", "CANCELLED"],
  WAITING_CUSTOMER_APPROVAL: ["IN_PROGRESS", "WAITING_PARTS", "DIAGNOSED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_PARTS", "WAITING_CUSTOMER_APPROVAL", "COMPLETED", "CANCELLED"],
  WAITING_PARTS: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: ["DELIVERED", "IN_PROGRESS", "CANCELLED"],
  // Teslim edilmiş servis iptal edilemez (AC-033); yalnızca yeniden açılabilir.
  DELIVERED: ["IN_PROGRESS"],
  CANCELLED: [],
};

/**
 * Ekranda öne çıkarılan "olağan sonraki adım" (birincil düğme). Diğer geçişler ikincil görünür.
 * İş tamamlandıktan sonraki adım (teslim) teslim panelindedir.
 */
export const SERVICE_MAIN_NEXT: Partial<Record<ServiceStatus, ServiceStatus>> = {
  RECEIVED: "DIAGNOSED",
  WAITING_DIAGNOSIS: "DIAGNOSED",
  DIAGNOSED: "IN_PROGRESS",
  WAITING_CUSTOMER_APPROVAL: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  WAITING_PARTS: "IN_PROGRESS",
};

/** İlerleme çubuğu aşamaları (bekleme durumları ait oldukları aşamada gösterilir). */
export const SERVICE_STAGES = ["Kabul", "Teşhis", "İşlemde", "Hazır", "Teslim"] as const;

/** Durumun ilerleme çubuğundaki aşaması (0-4); iptal için -1. */
export function serviceStage(status: string): number {
  switch (status) {
    case "RECEIVED":
    case "WAITING_DIAGNOSIS":
      return 0;
    case "DIAGNOSED":
    case "WAITING_CUSTOMER_APPROVAL":
      return 1;
    case "IN_PROGRESS":
    case "WAITING_PARTS":
      return 2;
    case "COMPLETED":
      return 3;
    case "DELIVERED":
      return 4;
    default:
      return -1;
  }
}

export function isServiceStatus(value: string): value is ServiceStatus {
  return (SERVICE_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  return SERVICE_TRANSITIONS[from].includes(to);
}

/** COMPLETED / DELIVERED durumundan İşlemde'ye dönüş: yeniden açma (neden zorunlu). */
export function isReopen(from: ServiceStatus, to: ServiceStatus): boolean {
  return (from === "COMPLETED" || from === "DELIVERED") && to === "IN_PROGRESS";
}

/** Bu geçiş için not / neden zorunlu mu? (iptal ve yeniden açma) */
export function requiresReason(from: ServiceStatus, to: ServiceStatus): boolean {
  return to === "CANCELLED" || isReopen(from, to);
}

/** Servis hâlâ açık mı? (teslim edilmemiş ve iptal edilmemiş) */
export function isOpenStatus(status: string): boolean {
  return status !== "DELIVERED" && status !== "CANCELLED";
}

/** Rozet rengi: ekranda durum türünü ayırt etmek için. */
export function statusTone(status: string): "gray" | "blue" | "yellow" | "green" | "red" | "accent" {
  switch (status) {
    case "RECEIVED":
    case "WAITING_DIAGNOSIS":
    case "DIAGNOSED":
      return "blue";
    case "WAITING_CUSTOMER_APPROVAL":
    case "WAITING_PARTS":
      return "yellow";
    case "IN_PROGRESS":
      return "accent";
    case "COMPLETED":
    case "DELIVERED":
      return "green";
    case "CANCELLED":
      return "red";
    default:
      return "gray";
  }
}

export function statusLabel(status: string): string {
  return isServiceStatus(status) ? SERVICE_STATUS_LABELS[status] : status;
}
