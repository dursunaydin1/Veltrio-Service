import { parseMoneyInput, parseQuantityInput } from "@/lib/calc";
import { moneyInput } from "@/lib/utils/currency";
import { stepQuantity } from "@/lib/utils/quantity";
import type { SaleItem } from "@/lib/db";
import type { Product, TaxMode } from "@/types";

/**
 * Satış formundaki bir satırın düzenlenen hâli (K-109): kutulardaki metinler olduğu gibi tutulur,
 * kaydederken `parseLine` ile doğrulanıp kuruşa çevrilir. Arayüzden bağımsız, test edilebilir.
 */
export type DraftLine = {
  key: string;
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  price: string;
  discount: string;
  taxMode: TaxMode;
  taxRate: string;
  /** Makine satışı: satılacak stoktaki birim */
  isSerial: boolean;
  serialUnitId: string;
  /** Satırda küçük fotoğraf için (K-103); taslaktan açılan satırda olmayabilir */
  photo?: string;
};

export type ParsedLine =
  | { ok: true; quantity: number; unitPriceKurus: number; discountKurus: number; taxRate: number }
  | { ok: false; error: string };

let keySeq = 0;
const nextKey = () => `s${++keySeq}`;

const rateText = (rate: number) => String(rate).replace(".", ",");

/** Taslak satışın kayıtlı satırlarını düzenlenebilir satırlara çevirir. */
export function linesFromItems(items: SaleItem[]): DraftLine[] {
  return items.map((i) => ({
    key: nextKey(),
    productId: i.product_id ?? "",
    name: i.description_snapshot,
    unit: i.unit,
    quantity: String(i.quantity).replace(".", ","),
    price: moneyInput(i.unit_price_snapshot),
    // Belge indirimi satırlara yazıldığından taslak düzenlemede satır indirimi olarak görünür.
    discount: i.discount_amount > 0 ? moneyInput(i.discount_amount) : "",
    taxMode: i.tax_mode as TaxMode,
    taxRate: rateText(i.tax_rate),
    isSerial: !!i.serial_unit_id,
    serialUnitId: i.serial_unit_id ?? "",
  }));
}

/** Ürünü satışa ekler. Aynı ürün zaten varsa yeni satır açılmaz, miktarı bir artar (K-097); makinede her birim ayrı satırdır. */
export function addProductLine(lines: DraftLine[], product: Product): DraftLine[] {
  const same = product.is_serial_tracked ? undefined : lines.find((l) => l.productId === product.id);
  if (same) return lines.map((l) => (l.key === same.key ? { ...l, quantity: stepQuantity(l.quantity, 1) } : l));
  return [
    ...lines,
    {
      key: nextKey(),
      productId: product.id,
      name: product.name,
      unit: product.unit,
      quantity: "1",
      price: moneyInput(product.default_sale_price),
      discount: "",
      taxMode: product.default_tax_mode,
      taxRate: rateText(product.default_tax_rate),
      isSerial: product.is_serial_tracked,
      serialUnitId: "",
      photo: product.photo,
    },
  ];
}

/** Satırı doğrular ve kuruş / sayıya çevirir; geçersizse kullanıcıya gösterilecek nedeni döner. */
export function parseLine(line: DraftLine): ParsedLine {
  const quantity = parseQuantityInput(line.quantity);
  const unitPriceKurus = parseMoneyInput(line.price);
  const discountKurus = line.discount.trim() === "" ? 0 : parseMoneyInput(line.discount);
  const taxRate = parseQuantityInput(line.taxRate);
  if (quantity === null || quantity <= 0) return { ok: false, error: `“${line.name}”: miktar sıfırdan büyük olmalıdır.` };
  if (unitPriceKurus === null) return { ok: false, error: `“${line.name}”: birim fiyat geçersiz.` };
  if (discountKurus === null) return { ok: false, error: `“${line.name}”: indirim geçersiz.` };
  if (taxRate === null || taxRate > 100) return { ok: false, error: `“${line.name}”: KDV oranı 0-100 olmalıdır.` };
  return { ok: true, quantity, unitPriceKurus, discountKurus, taxRate };
}
