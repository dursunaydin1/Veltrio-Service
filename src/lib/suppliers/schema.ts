import { z } from "zod";
import { isPlausiblePhone } from "@/lib/utils/phone";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir.`)
    .transform((v) => (v === "" ? undefined : v));

/** Tedarikçi formunun girdisi ve doğrulaması (Adım 4.5). Yalnızca ad zorunludur. */
export const supplierFormSchema = z.object({
  name: z.string().trim().min(1, "Tedarikçi adı zorunludur.").max(120, "En fazla 120 karakter olabilir."),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || isPlausiblePhone(v), "Telefon numarası geçersiz (alan kodu ile birlikte 10 hane).")
    .transform((v) => (v === "" ? undefined : v)),
  address: optionalText(300),
  notes: optionalText(1000),
});

export type SupplierFormInput = z.input<typeof supplierFormSchema>;

/** Veritabanına yazılacak, kullanıcının düzenleyebildiği tedarikçi alanları. */
export type SupplierFields = {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export type SupplierFormResult =
  | { ok: true; fields: SupplierFields }
  | { ok: false; errors: Partial<Record<keyof SupplierFormInput, string>> };

export function parseSupplierForm(input: SupplierFormInput): SupplierFormResult {
  const result = supplierFormSchema.safeParse(input);
  if (!result.success) {
    const errors: Partial<Record<keyof SupplierFormInput, string>> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof SupplierFormInput;
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, fields: result.data };
}
