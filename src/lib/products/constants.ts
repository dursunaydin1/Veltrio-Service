import type { TaxMode } from "@/types";

/** Başlangıç ürün kategorileri — PRD §8.1 */
export const PRODUCT_CATEGORIES = [
  "Makineler",
  "Yağlar",
  "Misina",
  "Buji",
  "Hava Filtresi",
  "Yakıt Filtresi",
  "Karbüratör",
  "Marş Grubu",
  "Debriyaj",
  "Bıçak",
  "Zincir",
  "Pala",
  "Aksesuar",
  "Diğer",
] as const;

/** value: veritabanında saklanan değer, label: ekranda görünen ad */
export const PRODUCT_UNITS = [
  { value: "ADET", label: "Adet" },
  { value: "LITRE", label: "Litre" },
  { value: "KG", label: "Kilogram" },
  { value: "METRE", label: "Metre" },
  { value: "KUTU", label: "Kutu" },
  { value: "TAKIM", label: "Takım" },
  { value: "PAKET", label: "Paket" },
  { value: "RULO", label: "Rulo" },
] as const;

export const TAX_MODE_LABELS: Record<TaxMode, string> = {
  INCLUSIVE: "KDV dahil",
  EXCLUSIVE: "KDV hariç",
  NONE: "KDV yok",
};

export function unitLabel(value: string): string {
  return PRODUCT_UNITS.find((u) => u.value === value)?.label ?? value;
}
