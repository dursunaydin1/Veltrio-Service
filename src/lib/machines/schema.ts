import { z } from "zod";

/** Sık kullanılan makine türleri (serbest metin de yazılabilir). */
export const MACHINE_TYPES = [
  "Zincirli testere",
  "İlaçlama motoru",
  "Tırpan",
  "Çim biçme makinesi",
  "Motopomp",
  "Diğer",
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir.`)
    .transform((v) => (v === "" ? undefined : v));

const MAX_YEAR = new Date().getFullYear() + 1;

/**
 * Makine formunun girdisi ve doğrulaması (Adım 3.3). Tür zorunludur; marka ve
 * model, makine "geçici kayıt" olarak açılmadıkça zorunludur (SR-016).
 */
export const machineFormSchema = z
  .object({
    customerId: z.string().min(1, "Müşteri seçin."),
    type: z.string().trim().min(1, "Makine türü zorunludur.").max(60, "En fazla 60 karakter olabilir."),
    brand: optionalText(60),
    model: optionalText(60),
    serialNumber: optionalText(60),
    year: z.string().trim(),
    notes: optionalText(1000),
    isTemporary: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (!value.isTemporary) {
      if (!value.brand) ctx.addIssue({ code: "custom", path: ["brand"], message: "Marka zorunludur (bilinmiyorsa geçici kayıt işaretleyin)." });
      if (!value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Model zorunludur (bilinmiyorsa geçici kayıt işaretleyin)." });
    }
    if (value.year !== "") {
      const year = Number(value.year);
      if (!/^\d{4}$/.test(value.year) || year < 1950 || year > MAX_YEAR) {
        ctx.addIssue({ code: "custom", path: ["year"], message: `Yıl 1950 ile ${MAX_YEAR} arasında olmalıdır.` });
      }
    }
  });

export type MachineFormInput = z.input<typeof machineFormSchema>;

/** Veritabanına yazılacak, kullanıcının düzenleyebildiği makine alanları. */
export type MachineFields = {
  customer_id: string;
  type: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  year?: number;
  notes?: string;
  is_temporary: boolean;
};

export type MachineFormResult =
  | { ok: true; fields: MachineFields }
  | { ok: false; errors: Partial<Record<keyof MachineFormInput, string>> };

export function parseMachineForm(input: MachineFormInput): MachineFormResult {
  const result = machineFormSchema.safeParse(input);
  if (!result.success) {
    const errors: Partial<Record<keyof MachineFormInput, string>> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof MachineFormInput;
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const v = result.data;
  return {
    ok: true,
    fields: {
      customer_id: v.customerId,
      type: v.type,
      brand: v.brand,
      model: v.model,
      serial_number: v.serialNumber,
      year: v.year === "" ? undefined : Number(v.year),
      notes: v.notes,
      is_temporary: v.isTemporary,
    },
  };
}
