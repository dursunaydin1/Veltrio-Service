import { z } from "zod";
import { isPlausiblePhone, normalizePhone } from "@/lib/utils/phone";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir.`)
    .transform((v) => (v === "" ? undefined : v));

/**
 * Müşteri formunun girdisi ve doğrulaması (Adım 3.2).
 * Ad, köy/mahalle ve (telefonu yok işaretlenmediyse) telefon zorunludur.
 * T.C. kimlik numarası gibi gereksiz kişisel veri istenmez.
 */
export const customerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Ad soyad zorunludur.").max(120, "En fazla 120 karakter olabilir."),
    phone: z.string().trim(),
    noPhone: z.boolean(),
    village: z.string().trim().min(1, "Köy / mahalle zorunludur.").max(120, "En fazla 120 karakter olabilir."),
    address: optionalText(300),
    notes: optionalText(1000),
    photo: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.noPhone) return;
    if (value.phone === "") {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Telefon zorunludur (yoksa “Telefonu yok” işaretleyin)." });
    } else if (!isPlausiblePhone(value.phone)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Telefon numarası geçersiz (alan kodu ile birlikte 10 hane)." });
    }
  });

export type CustomerFormInput = z.input<typeof customerFormSchema>;

/** Veritabanına yazılacak, kullanıcının düzenleyebildiği müşteri alanları. */
export type CustomerFields = {
  name: string;
  phone?: string;
  phone_normalized?: string;
  no_phone_flag: boolean;
  village: string;
  address?: string;
  notes?: string;
  photo?: string;
};

export type CustomerFormResult =
  | { ok: true; fields: CustomerFields }
  | { ok: false; errors: Partial<Record<keyof CustomerFormInput, string>> };

export function parseCustomerForm(input: CustomerFormInput): CustomerFormResult {
  const result = customerFormSchema.safeParse(input);
  if (!result.success) {
    const errors: Partial<Record<keyof CustomerFormInput, string>> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof CustomerFormInput;
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const v = result.data;
  const hasPhone = !v.noPhone && v.phone !== "";
  return {
    ok: true,
    fields: {
      name: v.name,
      phone: hasPhone ? v.phone : undefined,
      phone_normalized: hasPhone ? normalizePhone(v.phone) : undefined,
      no_phone_flag: v.noPhone,
      village: v.village,
      address: v.address,
      notes: v.notes,
      photo: v.photo || undefined,
    },
  };
}
