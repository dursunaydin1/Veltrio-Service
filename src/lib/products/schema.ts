import { z } from "zod";
import { fromKurus, parseMoneyInput, parseQuantityInput } from "@/lib/calc";

/** Boş metni `undefined` yapar (isteğe bağlı alanlar için). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir.`)
    .transform((v) => (v === "" ? undefined : v));

const requiredMoney = (label: string) =>
  z.string().superRefine((value, ctx) => {
    if (parseMoneyInput(value) === null) {
      ctx.addIssue({ code: "custom", message: `${label} geçerli bir tutar olmalıdır (ör. 1.250,50).` });
    }
  });

/**
 * Ürün formunun girdisi (hepsi metin) ve doğrulaması.
 * Para ve miktar kuralları `@/lib/calc` ile ortaktır.
 */
export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Ürün adı zorunludur.").max(120, "En fazla 120 karakter olabilir."),
  code: optionalText(60),
  category: optionalText(60),
  brand: optionalText(60),
  model: optionalText(60),
  unit: z.string().trim().min(1, "Birim seçin."),
  isSerialTracked: z.boolean(),
  salePrice: requiredMoney("Satış fiyatı"),
  lastPurchasePrice: z.string().superRefine((value, ctx) => {
    if (value.trim() !== "" && parseMoneyInput(value) === null) {
      ctx.addIssue({ code: "custom", message: "Alış fiyatı geçerli bir tutar olmalıdır." });
    }
  }),
  taxMode: z.enum(["INCLUSIVE", "EXCLUSIVE", "NONE"]),
  taxRate: z.string().superRefine((value, ctx) => {
    const rate = parseQuantityInput(value);
    if (rate === null || rate > 100) {
      ctx.addIssue({ code: "custom", message: "KDV oranı 0 ile 100 arasında olmalıdır." });
    }
  }),
  criticalStockLevel: z.string().superRefine((value, ctx) => {
    if (value.trim() !== "" && parseQuantityInput(value) === null) {
      ctx.addIssue({ code: "custom", message: "Kritik stok seviyesi geçerli bir sayı olmalıdır." });
    }
  }),
  compatibleModelsNote: optionalText(500),
  storageLocation: optionalText(60),
});

export type ProductFormInput = z.input<typeof productFormSchema>;

/** Veritabanına yazılacak, kullanıcının düzenleyebildiği ürün alanları. */
export type ProductFields = {
  name: string;
  code?: string;
  category?: string;
  brand?: string;
  model?: string;
  unit: string;
  is_serial_tracked: boolean;
  default_sale_price: number;
  last_purchase_price?: number;
  default_tax_mode: "INCLUSIVE" | "EXCLUSIVE" | "NONE";
  default_tax_rate: number;
  critical_stock_level?: number;
  compatible_models_note?: string;
  storage_location?: string;
};

export type ProductFormResult =
  | { ok: true; fields: ProductFields }
  | { ok: false; errors: Partial<Record<keyof ProductFormInput, string>> };

/**
 * Form girdisini doğrular ve veritabanı alanlarına çevirir.
 * Tutarlar kuruş üzerinden geçirilip TL'ye çevrilir (float hatası olmaz).
 */
export function parseProductForm(input: ProductFormInput): ProductFormResult {
  const result = productFormSchema.safeParse(input);
  if (!result.success) {
    const errors: Partial<Record<keyof ProductFormInput, string>> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof ProductFormInput;
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const v = result.data;
  const salePrice = parseMoneyInput(v.salePrice) as number;
  const purchase = v.lastPurchasePrice.trim() === "" ? undefined : parseMoneyInput(v.lastPurchasePrice);
  const critical = v.criticalStockLevel.trim() === "" ? undefined : parseQuantityInput(v.criticalStockLevel);

  return {
    ok: true,
    fields: {
      name: v.name,
      code: v.code,
      category: v.category,
      brand: v.brand,
      model: v.model,
      unit: v.unit,
      is_serial_tracked: v.isSerialTracked,
      default_sale_price: fromKurus(salePrice),
      last_purchase_price: purchase == null ? undefined : fromKurus(purchase),
      default_tax_mode: v.taxMode,
      default_tax_rate: parseQuantityInput(v.taxRate) as number,
      critical_stock_level: critical ?? undefined,
      compatible_models_note: v.compatibleModelsNote,
      storage_location: v.storageLocation,
    },
  };
}
