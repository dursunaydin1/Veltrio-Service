import { fromKurus, parseMoneyInput, parseQuantityInput } from "@/lib/calc";
import { PRODUCT_UNITS } from "@/lib/products/constants";
import { foldText } from "@/lib/utils/search";
import { isPlausiblePhone, normalizePhone } from "@/lib/utils/phone";
import type { ImportKind, RawRow } from "./definitions";

/**
 * İçe aktarma satırı doğrulama (Adım 6.2-6.5, FR-016, AC-015): saf fonksiyonlar. Hatalı satırlar
 * nedenleriyle raporlanır; mükerrer olanlar için kullanıcıya seçenek sunulur (eşleştir / birleştir /
 * ayrı kayıt). Hiçbir satır sessizce atlanmaz.
 */

export type Decision = "CREATE" | "MATCH" | "MERGE" | "REPLACE" | "SKIP";

export type ValidatedRow<D> = {
  rowNumber: number;
  data?: D;
  errors: string[];
  warnings: string[];
  duplicate?: { id?: string; label: string; inFile?: boolean };
  decisions: Decision[];
  defaultDecision: Decision;
};

export const DECISION_LABEL: Record<Decision, string> = {
  CREATE: "Ayrı kayıt aç",
  MATCH: "Mevcutla eşleştir (atla)",
  MERGE: "Mevcutla birleştir (boşları doldur)",
  REPLACE: "Değiştir",
  SKIP: "Atla",
};

const today = () => new Date().toISOString().slice(0, 10);

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  const tr = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(raw);
  const parts = iso ? { y: iso[1], m: iso[2], d: iso[3] } : tr ? { y: tr[3], m: tr[2], d: tr[1] } : null;
  if (!parts) return null;
  const date = new Date(`${parts.y}-${parts.m.padStart(2, "0")}-${parts.d.padStart(2, "0")}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(parts.d) ? null : date.toISOString().slice(0, 10);
}

const row = <D,>(rowNumber: number): ValidatedRow<D> => ({ rowNumber, errors: [], warnings: [], decisions: [], defaultDecision: "SKIP" });

// ------------------------------------------------------------------ Müşteri

export type CustomerImport = { name: string; phone?: string; phone_normalized?: string; no_phone_flag: boolean; village: string; notes?: string };
export type CustomerContext = { customers: { id: string; name: string; phone_normalized?: string }[] };

export function validateCustomers(rows: RawRow[], ctx: CustomerContext): ValidatedRow<CustomerImport>[] {
  const byPhone = new Map(ctx.customers.filter((c) => c.phone_normalized).map((c) => [c.phone_normalized as string, c]));
  const seen = new Map<string, number>();
  return rows.map(({ rowNumber, values }) => {
    const out = row<CustomerImport>(rowNumber);
    const name = values.name.trim();
    if (!name) out.errors.push("Ad soyad boş.");
    if (name.length > 120) out.errors.push("Ad soyad en fazla 120 karakter olabilir.");

    let phone: string | undefined;
    let normalized: string | undefined;
    if (values.phone) {
      if (isPlausiblePhone(values.phone)) {
        phone = values.phone;
        normalized = normalizePhone(values.phone);
      } else out.errors.push(`Telefon numarası geçersiz: “${values.phone}”.`);
    }
    let village = values.village.trim();
    if (!village) {
      village = "Belirtilmedi";
      out.warnings.push("Adres / köy boş: “Belirtilmedi” yazılacak.");
    }
    if (out.errors.length > 0) return out;

    out.data = { name, phone, phone_normalized: normalized, no_phone_flag: !phone, village, notes: values.notes.trim() || undefined };
    if (normalized) {
      const existing = byPhone.get(normalized);
      const earlier = seen.get(normalized);
      if (existing) {
        out.duplicate = { id: existing.id, label: `${existing.name} (kayıtlı müşteri)` };
        out.decisions = ["MATCH", "MERGE", "CREATE"];
        out.defaultDecision = "MATCH";
        out.warnings.push(`Bu telefon “${existing.name}” adına kayıtlı.`);
      } else if (earlier !== undefined) {
        out.duplicate = { label: `dosyadaki ${earlier}. satır`, inFile: true };
        out.decisions = ["MATCH", "CREATE"];
        out.defaultDecision = "MATCH";
        out.warnings.push(`Bu telefon dosyada ${earlier}. satırda da var.`);
      }
      if (!seen.has(normalized)) seen.set(normalized, rowNumber);
    }
    if (out.decisions.length === 0) { out.decisions = ["CREATE"]; out.defaultDecision = "CREATE"; }
    return out;
  });
}

// ------------------------------------------------------------------ Ürün

export type ProductImport = {
  name: string; code?: string; category?: string; unit: string; default_sale_price: number;
  critical_stock_level?: number; default_tax_rate?: number;
};
export type ProductContext = { products: { id: string; name: string; code?: string; is_serial_tracked: boolean; archived: boolean }[] };

const UNIT_LOOKUP = new Map<string, string>(
  PRODUCT_UNITS.flatMap((u) => [[foldText(u.label), u.value], [foldText(u.value), u.value]] as [string, string][]).concat([
    ["mt", "METRE"], ["lt", "LITRE"], ["adt", "ADET"], ["pkt", "PAKET"],
  ])
);

export function validateProducts(rows: RawRow[], ctx: ProductContext): ValidatedRow<ProductImport>[] {
  const byCode = new Map(ctx.products.filter((p) => p.code).map((p) => [foldText(p.code as string), p]));
  const byName = new Map(ctx.products.map((p) => [foldText(p.name), p]));
  const seenCode = new Map<string, number>();
  return rows.map(({ rowNumber, values }) => {
    const out = row<ProductImport>(rowNumber);
    const name = values.name.trim();
    if (!name) out.errors.push("Ürün adı boş.");
    if (name.length > 120) out.errors.push("Ürün adı en fazla 120 karakter olabilir.");

    let unit = "ADET";
    if (values.unit) {
      const hit = UNIT_LOOKUP.get(foldText(values.unit.trim()));
      if (hit) unit = hit;
      else out.errors.push(`Birim tanınmadı: “${values.unit}” (adet, litre, kg, metre, kutu, takım, paket, rulo).`);
    }
    let price = 0;
    if (values.salePrice) {
      const kurus = parseMoneyInput(values.salePrice);
      if (kurus === null) out.errors.push(`Satış fiyatı geçersiz: “${values.salePrice}”.`);
      else price = fromKurus(kurus);
    } else out.warnings.push("Satış fiyatı boş: 0 ₺ yazılacak.");
    let critical: number | undefined;
    if (values.critical) {
      const q = parseQuantityInput(values.critical);
      if (q === null) out.errors.push(`Kritik stok geçersiz: “${values.critical}”.`);
      else critical = q;
    }
    let taxRate: number | undefined;
    if (values.taxRate) {
      const r = parseQuantityInput(values.taxRate);
      if (r === null || r > 100) out.errors.push(`KDV oranı geçersiz: “${values.taxRate}”.`);
      else taxRate = r;
    }
    if (out.errors.length > 0) return out;

    const code = values.code.trim() || undefined;
    out.data = { name, code, category: values.category.trim() || undefined, unit, default_sale_price: price, critical_stock_level: critical, default_tax_rate: taxRate };

    const codeKey = code ? foldText(code) : undefined;
    const sameCode = codeKey ? byCode.get(codeKey) : undefined;
    const earlierCode = codeKey ? seenCode.get(codeKey) : undefined;
    const sameName = byName.get(foldText(name));
    if (sameCode) {
      out.duplicate = { id: sameCode.id, label: `${sameCode.name} (kod ${sameCode.code})` };
      out.decisions = ["MATCH", "MERGE"]; // aynı kodla ikinci ürün açılamaz
      out.defaultDecision = "MATCH";
      out.warnings.push(`Ürün kodu “${code}” zaten kayıtlı.`);
    } else if (earlierCode !== undefined) {
      out.duplicate = { label: `dosyadaki ${earlierCode}. satır`, inFile: true };
      out.decisions = ["MATCH"];
      out.defaultDecision = "MATCH";
      out.warnings.push(`Ürün kodu “${code}” dosyada ${earlierCode}. satırda da var.`);
    } else if (sameName) {
      out.duplicate = { id: sameName.id, label: `${sameName.name} (aynı ad)` };
      out.decisions = ["MATCH", "MERGE", "CREATE"];
      out.defaultDecision = "MATCH";
      out.warnings.push(`“${sameName.name}” adlı ürün zaten var.`);
    }
    if (codeKey && !seenCode.has(codeKey)) seenCode.set(codeKey, rowNumber);
    if (out.decisions.length === 0) { out.decisions = ["CREATE"]; out.defaultDecision = "CREATE"; }
    return out;
  });
}

// ------------------------------------------------------------------ Açılış stoğu

export type OpeningStockImport = { productId: string; productName: string; quantity: number; date: string; note?: string };

export function validateOpeningStock(rows: RawRow[], ctx: ProductContext): ValidatedRow<OpeningStockImport>[] {
  const active = ctx.products.filter((p) => !p.archived);
  return rows.map(({ rowNumber, values }) => {
    const out = row<OpeningStockImport>(rowNumber);
    const ref = foldText(values.product.trim());
    if (!ref) out.errors.push("Ürün boş.");
    const matches = ref ? active.filter((p) => foldText(p.code ?? "") === ref || foldText(p.name) === ref) : [];
    const unique = [...new Map(matches.map((p) => [p.id, p])).values()];
    if (ref && unique.length === 0) out.errors.push(`Ürün bulunamadı: “${values.product}” (önce ürün listesini içe aktarın).`);
    if (unique.length > 1) out.errors.push(`“${values.product}” birden çok ürünle eşleşiyor; ürün kodunu kullanın.`);

    const qty = values.quantity ? parseQuantityInput(values.quantity) : null;
    if (!values.quantity) out.errors.push("Miktar boş.");
    else if (qty === null || qty <= 0) out.errors.push(`Miktar sıfırdan büyük bir sayı olmalı: “${values.quantity}”.`);
    let date = today();
    if (values.date) {
      const d = parseDate(values.date);
      if (!d) out.errors.push(`Tarih geçersiz: “${values.date}” (gg.aa.yyyy veya yyyy-aa-gg).`);
      else date = d;
    }
    const product = unique[0];
    if (product?.is_serial_tracked) out.errors.push(`“${product.name}” seri takipli bir ürün; açılış stoğu birim birim seri numarasıyla girilir.`);
    if (out.errors.length > 0) return out;
    out.data = { productId: product.id, productName: product.name, quantity: qty as number, date, note: values.note.trim() || undefined };
    out.decisions = ["CREATE"];
    out.defaultDecision = "CREATE";
    return out;
  });
}

// ------------------------------------------------------------------ Açılış bakiyesi

export type OpeningBalanceImport = {
  partyType: "CUSTOMER" | "SUPPLIER"; partyId: string; partyName: string;
  direction: "OWED_BY_PARTY" | "OWED_TO_PARTY"; amountKurus: number; asOfDate: string; note?: string;
};
export type BalanceContext = {
  customers: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  /** Zaten açılış bakiyesi olan taraflar: `${tür}:${id}` */
  hasOpening: Set<string>;
};

/** Yön metni: "borçlu" taraf bize borçlu (müşteri borcu), "alacaklı" biz tarafa borçluyuz. */
function parseDirection(raw: string): "OWED_BY_PARTY" | "OWED_TO_PARTY" | null {
  const t = foldText(raw.trim());
  if (["owed_by_party", "borclu", "borc", "bize borclu", "musteri borclu", "borclu musteri", "b"].includes(t)) return "OWED_BY_PARTY";
  if (["owed_to_party", "alacakli", "alacak", "biz borcluyuz", "tedarikciye borclu", "a"].includes(t)) return "OWED_TO_PARTY";
  return null;
}

export function validateOpeningBalances(rows: RawRow[], ctx: BalanceContext): ValidatedRow<OpeningBalanceImport>[] {
  const seen = new Map<string, number>();
  return rows.map(({ rowNumber, values }) => {
    const out = row<OpeningBalanceImport>(rowNumber);
    const ref = foldText(values.party.trim());
    if (!ref) out.errors.push("Taraf adı boş.");

    const typeText = foldText(values.type.trim());
    const wantCustomer = !typeText || typeText.startsWith("must");
    const wantSupplier = !typeText || typeText.startsWith("ted");
    if (typeText && !wantCustomer && !wantSupplier) out.errors.push(`Tür tanınmadı: “${values.type}” (müşteri veya tedarikçi).`);
    const hits: { type: "CUSTOMER" | "SUPPLIER"; id: string; name: string }[] = [
      ...(wantCustomer ? ctx.customers.filter((c) => foldText(c.name) === ref).map((c) => ({ type: "CUSTOMER" as const, id: c.id, name: c.name })) : []),
      ...(wantSupplier ? ctx.suppliers.filter((s) => foldText(s.name) === ref).map((s) => ({ type: "SUPPLIER" as const, id: s.id, name: s.name })) : []),
    ];
    if (ref && hits.length === 0) out.errors.push(`Taraf bulunamadı: “${values.party}” (önce müşteri / tedarikçi listesini içe aktarın).`);
    if (hits.length > 1) out.errors.push(`“${values.party}” birden çok kayıtla eşleşiyor; “Tür” sütununu doldurun veya adı ayırt edin.`);

    const direction = parseDirection(values.direction);
    if (!values.direction) out.errors.push("Yön boş (borçlu / alacaklı).");
    else if (!direction) out.errors.push(`Yön tanınmadı: “${values.direction}” (borçlu veya alacaklı).`);
    const kurus = values.amount ? parseMoneyInput(values.amount) : null;
    if (!values.amount) out.errors.push("Tutar boş.");
    else if (kurus === null || kurus <= 0) out.errors.push(`Tutar sıfırdan büyük bir sayı olmalı: “${values.amount}”.`);
    let date = today();
    if (values.date) {
      const d = parseDate(values.date);
      if (!d) out.errors.push(`Tarih geçersiz: “${values.date}”.`);
      else date = d;
    }
    if (out.errors.length > 0) return out;

    const party = hits[0];
    const key = `${party.type}:${party.id}`;
    if (seen.has(key)) {
      out.errors.push(`“${party.name}” için dosyada ${seen.get(key)}. satırda zaten bakiye var (taraf başına tek açılış bakiyesi olur).`);
      return out;
    }
    seen.set(key, rowNumber);
    out.data = { partyType: party.type, partyId: party.id, partyName: party.name, direction: direction as "OWED_BY_PARTY" | "OWED_TO_PARTY", amountKurus: kurus as number, asOfDate: date, note: values.note.trim() || undefined };
    if (ctx.hasOpening.has(key)) {
      out.duplicate = { id: party.id, label: `${party.name} (kayıtlı açılış bakiyesi)` };
      out.decisions = ["SKIP", "REPLACE"];
      out.defaultDecision = "SKIP";
      out.warnings.push("Bu tarafın açılış bakiyesi zaten var; değiştirmek kritik işlemdir (nedeni “içe aktarma” olarak kaydedilir).");
    } else {
      out.decisions = ["CREATE"];
      out.defaultDecision = "CREATE";
    }
    return out;
  });
}

export const VALIDATORS = {
  customers: validateCustomers,
  products: validateProducts,
  "opening-stock": validateOpeningStock,
  "opening-balances": validateOpeningBalances,
} as const satisfies Record<ImportKind, unknown>;
