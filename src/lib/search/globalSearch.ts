import { db } from "@/lib/db";
import { machineTitleOf } from "@/lib/machines/title";
import { normalizePhone } from "@/lib/utils/phone";
import { foldText } from "@/lib/utils/search";

/**
 * Genel arama (Adım 1.10, FR-024, AC-022): müşteri adı/telefon, makine iç no /
 * seri no, servis no, ürün adı/kodu, satış no, alım no, tedarikçi. Sonuçlar türüne
 * göre etiketlenir; arşivdekiler varsayılan olarak hariçtir. Arama bu cihazdaki
 * eşitlenmiş kayıtlar üzerinde yapılır (çevrimdışı da çalışır).
 */

export type SearchKind = "customer" | "machine" | "service" | "product" | "sale" | "purchase" | "supplier";

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  customer: "Müşteri",
  machine: "Makine",
  service: "Servis",
  product: "Ürün",
  sale: "Satış",
  purchase: "Alım",
  supplier: "Tedarikçi",
};

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  archived: boolean;
};

export const PER_KIND_LIMIT = 8;
export const MIN_QUERY_LENGTH = 2;

/** Sorguyu kelimelere ve (varsa) telefon rakamlarına ayırır. */
export function parseQuery(query: string): { words: string[]; digits: string } {
  const folded = foldText(query.trim());
  return { words: folded.split(/\s+/).filter(Boolean), digits: normalizePhone(query) };
}

/** Tüm kelimeler birleştirilmiş metinde geçiyorsa eşleşir. */
export function matchesWords(words: string[], ...fields: (string | undefined | null)[]): boolean {
  if (words.length === 0) return false;
  const haystack = foldText(fields.filter(Boolean).join(" "));
  return words.every((w) => haystack.includes(w));
}

/** En az 4 rakamlık sorgu telefon olarak da aranır (0532…, +90…, boşluklu yazım fark etmez). */
export function matchesPhone(digits: string, phone?: string | null): boolean {
  if (digits.length < 4 || !phone) return false;
  // Kısmi yazımda baştaki 0 / 90 telefonun parçası değildir: 0532… ve 532… aynı sayılır
  const needles = new Set([digits]);
  if (digits.startsWith("0")) needles.add(digits.slice(1));
  if (digits.startsWith("90")) needles.add(digits.slice(2));
  const normalized = normalizePhone(phone);
  return [...needles].some((n) => n.length >= 4 && normalized.includes(n));
}

export async function searchAll(
  businessId: string,
  query: string,
  options: { includeArchived?: boolean } = {}
): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];
  const { words, digits } = parseQuery(q);
  const withArchived = options.includeArchived === true;
  const hits: SearchHit[] = [];
  const push = (kind: SearchKind, hit: Omit<SearchHit, "kind">) => hits.push({ kind, ...hit });
  const take = <T,>(rows: T[]) => rows.slice(0, PER_KIND_LIMIT);

  const [customers, machines, services, products, sales, purchases, suppliers] = await Promise.all([
    db.customers.where("business_id").equals(businessId).toArray(),
    db.machines.where("business_id").equals(businessId).toArray(),
    db.services.where("business_id").equals(businessId).toArray(),
    db.products.where("business_id").equals(businessId).toArray(),
    db.sales.where("business_id").equals(businessId).toArray(),
    db.purchases.where("business_id").equals(businessId).toArray(),
    db.suppliers.where("business_id").equals(businessId).toArray(),
  ]);
  const customerName = new Map(customers.map((c) => [c.id, c.name]));

  for (const c of take(
    customers.filter((c) => (withArchived || !c.archived_at) && (matchesWords(words, c.name, c.village, c.phone) || matchesPhone(digits, c.phone)))
  )) {
    push("customer", { id: c.id, title: c.name, subtitle: [c.village, c.phone].filter(Boolean).join(" · "), href: `/customers/${c.id}`, archived: !!c.archived_at });
  }

  for (const m of take(
    machines.filter(
      (m) =>
        (withArchived || (!m.archived_at && !m.merged_into_id)) &&
        matchesWords(words, m.internal_number, m.serial_number, m.brand, m.model, m.type)
    )
  )) {
    push("machine", {
      id: m.id,
      title: machineTitleOf(m),
      subtitle: [m.internal_number, m.serial_number, customerName.get(m.customer_id ?? "")].filter(Boolean).join(" · "),
      href: `/machines/${m.id}`,
      archived: !!m.archived_at,
    });
  }

  for (const s of take(
    services.filter((s) => matchesWords(words, s.document_no, s.customer_complaint, customerName.get(s.customer_id ?? "")))
  )) {
    push("service", { id: s.id, title: s.document_no, subtitle: [customerName.get(s.customer_id ?? ""), s.customer_complaint].filter(Boolean).join(" · "), href: `/services/${s.id}`, archived: false });
  }

  for (const p of take(
    products.filter((p) => (withArchived || !p.archived_at) && matchesWords(words, p.name, p.code, p.brand, p.model, p.category))
  )) {
    push("product", { id: p.id, title: p.name, subtitle: [p.code, p.brand, p.model].filter(Boolean).join(" · "), href: `/products/${p.id}`, archived: !!p.archived_at });
  }

  for (const s of take(
    sales.filter((s) => matchesWords(words, s.document_no, customerName.get(s.customer_id ?? ""), s.notes))
  )) {
    push("sale", { id: s.id, title: s.document_no, subtitle: customerName.get(s.customer_id ?? "") ?? "Müşterisiz satış", href: `/sales/${s.id}`, archived: false });
  }

  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  for (const p of take(
    purchases.filter((p) => matchesWords(words, p.document_no, p.supplier_ref, supplierName.get(p.supplier_id ?? "")))
  )) {
    push("purchase", { id: p.id, title: p.document_no, subtitle: supplierName.get(p.supplier_id ?? ""), href: `/purchases/${p.id}`, archived: false });
  }

  for (const s of take(
    suppliers.filter((s) => (withArchived || !s.archived_at) && (matchesWords(words, s.name, s.phone) || matchesPhone(digits, s.phone)))
  )) {
    push("supplier", { id: s.id, title: s.name, subtitle: s.phone, href: `/suppliers/${s.id}`, archived: !!s.archived_at });
  }

  return hits;
}
