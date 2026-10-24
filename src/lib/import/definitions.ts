import * as XLSX from "xlsx";
import { foldText } from "@/lib/utils/search";

/**
 * İçe aktarma türleri, alanları ve şablonları (Adım 6.1-6.5). Sütun başlıkları farklı
 * yazılmış dosyalar için "alan eşleştirme" önerisi başlık takma adlarından üretilir.
 */

export type ImportKind = "customers" | "products" | "opening-stock" | "opening-balances";

export type FieldDef = { key: string; label: string; required: boolean; aliases: string[]; example: string };

export const IMPORT_DEFS: Record<ImportKind, { label: string; description: string; fields: FieldDef[] }> = {
  customers: {
    label: "Müşteri listesi",
    description: "Ad, telefon, adres / köy ve not. Telefon eşleşen müşteriler mükerrer olarak işaretlenir.",
    fields: [
      { key: "name", label: "Ad soyad", required: true, aliases: ["ad", "adi", "isim", "musteri", "unvan", "ad soyad", "adsoyad"], example: "Ali Yılmaz" },
      { key: "phone", label: "Telefon", required: false, aliases: ["telefon", "tel", "gsm", "cep", "cep telefonu", "telefon no"], example: "0532 123 45 67" },
      { key: "village", label: "Adres / köy", required: false, aliases: ["adres", "koy", "mahalle", "koy mahalle", "yer", "il ilce", "adres koy"], example: "Çamlıca Köyü" },
      { key: "notes", label: "Not", required: false, aliases: ["not", "notlar", "aciklama"], example: "Testere müşterisi" },
    ],
  },
  products: {
    label: "Ürün listesi",
    description: "Ad, kod, kategori, birim, satış fiyatı, kritik stok ve KDV. Ürün kodu tekrarı uyarılır.",
    fields: [
      { key: "name", label: "Ürün adı", required: true, aliases: ["urun", "urun adi", "ad", "adi", "stok adi", "malzeme"], example: "NGK Buji" },
      { key: "code", label: "Kod", required: false, aliases: ["kod", "urun kodu", "stok kodu", "barkod", "sku"], example: "BJ-01" },
      { key: "category", label: "Kategori", required: false, aliases: ["kategori", "grup", "tur", "cins"], example: "Buji" },
      { key: "unit", label: "Birim", required: false, aliases: ["birim", "olcu birimi"], example: "Adet" },
      { key: "salePrice", label: "Satış fiyatı", required: false, aliases: ["satis fiyati", "fiyat", "birim fiyat", "satis", "liste fiyati"], example: "125,50" },
      { key: "critical", label: "Kritik stok", required: false, aliases: ["kritik stok", "kritik", "minimum", "min stok", "emniyet stoku"], example: "5" },
      { key: "taxRate", label: "KDV oranı (%)", required: false, aliases: ["kdv", "kdv orani", "vergi", "vergi orani"], example: "20" },
    ],
  },
  "opening-stock": {
    label: "Açılış stoğu",
    description: "Her satır bir açılış stok hareketi üretir. Ürün adı veya koduyla eşleşmelidir.",
    fields: [
      { key: "product", label: "Ürün (ad veya kod)", required: true, aliases: ["urun", "urun adi", "urun kodu", "kod", "stok", "malzeme", "ad"], example: "NGK Buji" },
      { key: "quantity", label: "Miktar", required: true, aliases: ["miktar", "adet", "stok miktari", "mevcut", "sayim"], example: "12" },
      { key: "date", label: "Tarih", required: false, aliases: ["tarih", "sayim tarihi", "acilis tarihi"], example: "2026-10-01" },
      { key: "note", label: "Açıklama", required: false, aliases: ["aciklama", "not", "notlar"], example: "Sayım sonucu" },
    ],
  },
  "opening-balances": {
    label: "Müşteri / tedarikçi açılış bakiyesi",
    description: "Sahte satış veya ödeme oluşturulmaz; açılış bakiyesi kaydı yazılır.",
    fields: [
      { key: "party", label: "Taraf (müşteri / tedarikçi adı)", required: true, aliases: ["taraf", "musteri", "tedarikci", "cari", "unvan", "ad", "hesap"], example: "Ali Yılmaz" },
      { key: "type", label: "Tür (müşteri / tedarikçi)", required: false, aliases: ["tur", "cari turu", "taraf turu", "tip"], example: "Müşteri" },
      { key: "direction", label: "Yön (borçlu / alacaklı)", required: true, aliases: ["yon", "borc alacak", "durum", "bakiye turu"], example: "Borçlu" },
      { key: "amount", label: "Tutar", required: true, aliases: ["tutar", "bakiye", "borc", "meblag"], example: "1.250,50" },
      { key: "date", label: "Tarih", required: false, aliases: ["tarih", "bakiye tarihi", "acilis tarihi"], example: "2026-10-01" },
      { key: "note", label: "Açıklama", required: false, aliases: ["aciklama", "not", "notlar"], example: "Defterden devir" },
    ],
  },
};

export type Mapping = Record<string, number | null>;

/** Başlıkları alan takma adlarıyla eşleştirir (Türkçe harf ve büyük/küçük harf farkı gözetilmez). */
export function suggestMapping(headers: string[], fields: FieldDef[]): Mapping {
  const norm = (t: string) => foldText(t).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const folded = headers.map(norm);
  const used = new Set<number>();
  const mapping: Mapping = Object.fromEntries(fields.map((f) => [f.key, null]));
  const wantedOf = (f: FieldDef) => [norm(f.label), ...f.aliases];

  // 1. geçiş: tam eşleşme (önce kesin olanlar, böylece "bakiye" başka alanın benzeri tarafından kapılmaz)
  for (const f of fields) {
    const hit = folded.findIndex((h, i) => !used.has(i) && wantedOf(f).includes(h));
    if (hit !== -1) { mapping[f.key] = hit; used.add(hit); }
  }
  // 2. geçiş: kısmi eşleşme (kalan alanlar, kalan sütunlar)
  for (const f of fields) {
    if (mapping[f.key] !== null) continue;
    const wanted = wantedOf(f);
    const hit = folded.findIndex((h, i) => !used.has(i) && h !== "" && wanted.some((w) => h.includes(w) || w.includes(h)));
    if (hit !== -1) { mapping[f.key] = hit; used.add(hit); }
  }
  return mapping;
}

export type RawRow = { rowNumber: number; values: Record<string, string> };

/** Eşleştirmeyi uygulayıp her satırı alan adlarıyla anahtarlı nesneye çevirir (satır numarası dosyadaki sıradır). */
export function applyMapping(rows: string[][], fields: FieldDef[], mapping: Mapping): RawRow[] {
  return rows.map((cells, i) => ({
    rowNumber: i + 2, // 1. satır başlıktır
    values: Object.fromEntries(fields.map((f) => [f.key, mapping[f.key] == null ? "" : (cells[mapping[f.key] as number] ?? "").trim()])),
  }));
}

export function missingRequired(fields: FieldDef[], mapping: Mapping): FieldDef[] {
  return fields.filter((f) => f.required && mapping[f.key] == null);
}

/** İndirilebilir şablon (.xlsx): başlıklar + örnek satır. */
export function templateXlsx(kind: ImportKind): Uint8Array {
  const def = IMPORT_DEFS[kind];
  const sheet = XLSX.utils.aoa_to_sheet([def.fields.map((f) => f.label), def.fields.map((f) => f.example)]);
  sheet["!cols"] = def.fields.map((f) => ({ wch: Math.max(14, f.label.length + 2) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Şablon");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
