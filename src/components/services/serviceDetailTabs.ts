/** Servis detayı sekmeleri ve servis bilgisi yardımcıları; detay ekranı ve parçaları ortak kullanır (K-109). */
import type { Service } from "@/lib/db";

export type DetailTab = "summary" | "details" | "lines" | "checklist" | "payments" | "history";

/** Servis için ortak "bilgileri kaydet" girdisi: yalnızca verilen alanlar değişir. */
export function detailsOf(service: Service, patch: { diagnosis?: string; resolution?: string }) {
  return {
    customer_complaint: service.customer_complaint ?? "",
    diagnosis: patch.diagnosis ?? service.diagnosis ?? "",
    resolution: patch.resolution ?? service.resolution ?? "",
    promised_date: service.promised_date,
    existing_damage: service.existing_damage ?? "",
    received_accessories: service.received_accessories ?? "",
    is_warranty_claim: service.is_warranty_claim,
    warranty_source: service.warranty_source ?? "",
    warranty_coverage: service.warranty_coverage ?? "",
  };
}
