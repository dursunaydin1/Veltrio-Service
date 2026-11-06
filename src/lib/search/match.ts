import type { Purchase, Sale, Service } from "@/lib/db";
import type { Customer, Machine, Product, Supplier } from "@/types";
import { foldText } from "@/lib/utils/search";

/**
 * Liste ve seçici aramaları (K-106): her kayıt türünün hangi alanlarda arandığı tek yerde.
 * Yeni bir aranabilir alan (ör. ürün barkodu) yalnızca buraya eklenir; liste, seçici ve
 * genel arama (`globalSearch`) aynı alanları kullanır.
 *
 * Kural: Türkçe karakter ve büyük / küçük harf fark etmez, sorgudaki her kelime geçmelidir.
 * Boş sorgu her şeyi getirir. Harf içermeyen sorgu (müşteri, tedarikçi) telefonda aranır.
 */

type Field = string | number | null | undefined;

/** Sorgunun sadeleştirilmiş kelimeleri. */
export function queryWords(query: string): string[] {
  return foldText(query.trim()).split(/\s+/).filter(Boolean);
}

/** Boş sorgu true; değilse her kelime alanların birleşiminde geçmeli. */
export function matchesText(query: string, fields: readonly Field[]): boolean {
  const words = queryWords(query);
  if (words.length === 0) return true;
  const haystack = foldText(fields.filter((f) => f != null && f !== "").join(" "));
  return words.every((w) => haystack.includes(w));
}

/** Yalnızca rakamlı sorgu telefonda aranır: en az 3 rakam, baştaki 0 yok sayılır. */
function matchesPhoneDigits(query: string, phoneDigits: string | undefined): boolean {
  const digits = query.replace(/\D/g, "").replace(/^0/, "");
  return digits.length >= 3 && (phoneDigits ?? "").includes(digits);
}

const hasLetter = (query: string) => /\p{L}/u.test(query);

// ---------------------------------------------------------------- aranan alanlar

export const customerFields = (c: Customer): Field[] => [c.name, c.village, c.address];
export const supplierFields = (s: Supplier): Field[] => [s.name, s.address];
export const productFields = (p: Product): Field[] => [p.name, p.code, p.barcode, p.category, p.brand, p.model];
export const machineFields = (m: Machine, ownerName = ""): Field[] => [m.type, m.brand, m.model, m.serial_number, m.internal_number, ownerName];
export const saleFields = (s: Sale, customerName = ""): Field[] => [s.document_no, customerName, s.notes];
export const purchaseFields = (p: Purchase, supplierName = ""): Field[] => [p.document_no, supplierName, p.supplier_ref, p.notes];
export const serviceFields = (s: Service, customerName = "", machineText = ""): Field[] => [s.document_no, customerName, machineText, s.customer_complaint];

// ---------------------------------------------------------------- eşleştiriciler

/** Harf içeriyorsa ad / köy / adreste; yalnızca rakamsa telefonda. */
export function matchesCustomer(customer: Customer, query: string): boolean {
  if (!query.trim()) return true;
  if (!hasLetter(query)) return matchesPhoneDigits(query, customer.phone_normalized);
  return matchesText(query, customerFields(customer));
}

/** Harf içeriyorsa ad / adreste; yalnızca rakamsa telefonda. */
export function matchesSupplier(supplier: Supplier, query: string): boolean {
  if (!query.trim()) return true;
  if (!hasLetter(query)) return matchesPhoneDigits(query, (supplier.phone ?? "").replace(/\D/g, "").replace(/^0/, ""));
  return matchesText(query, supplierFields(supplier));
}

export const matchesProduct = (product: Product, query: string) => matchesText(query, productFields(product));
export const matchesMachine = (machine: Machine, ownerName: string, query: string) => matchesText(query, machineFields(machine, ownerName));
export const matchesSale = (sale: Sale, customerName: string, query: string) => matchesText(query, saleFields(sale, customerName));
export const matchesPurchase = (purchase: Purchase, supplierName: string, query: string) => matchesText(query, purchaseFields(purchase, supplierName));
export const matchesService = (service: Service, customerName: string, machineText: string, query: string) =>
  matchesText(query, serviceFields(service, customerName, machineText));
