import { db } from "@/lib/db";
import type { IssueCatalogEntry, OperationCatalogEntry, ServiceTemplate, ServiceTemplateItem } from "@/lib/db";
import { fromKurus } from "@/lib/calc";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import { foldText } from "@/lib/utils/search";
import type { BusinessContext } from "@/hooks/useBusinessContext";

/**
 * Arıza / işlem katalogları ve servis şablonları (Adım 3.5, FR-009, FR-011).
 * Katalog satırı yalnızca kolay seçim içindir: servise eklenen satırın açıklaması
 * ve fiyatı kopyalanır, katalog sonradan değişse geçmiş satırlar değişmez.
 */

export class CatalogRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogRuleError";
  }
}

export const OPERATION_CATEGORIES = [
  "Arıza Tespiti", "Genel Bakım", "Karbüratör", "Filtre", "Buji", "Marş",
  "Bıçak/Zincir/Pala", "Montaj", "İlk Çalıştırma", "Motor Testi", "Diğer",
] as const;

export const ISSUE_CATEGORIES = [
  "Çalışmıyor", "Zor Çalışıyor", "Güç Kaybı", "Stop Ediyor", "Yakıt Kaçağı", "Yağlama Sorunu",
  "Titreşim/Ses", "Kesmiyor/Biçmiyor", "Parça Kırığı/Hasarı", "Bakım Talebi", "Diğer",
] as const;

const tidy = (v?: string) => v?.trim() || undefined;

// ---------------------------------------------------------------- yardımcılar

type Versioned = { id: string; business_id: string; version?: number };

function payload<T extends Versioned>(row: T, columns: readonly (keyof T)[], update: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { id: row.id, business_id: row.business_id };
  for (const c of columns) out[c as string] = row[c] ?? null;
  if (update) out.version = row.version ?? 1;
  else out.created_at = (row as unknown as { created_at: string }).created_at;
  return out;
}

const OPERATION_COLUMNS = ["name", "category", "suggested_price", "default_duration", "active"] as const;
const ISSUE_COLUMNS = ["name", "category", "active"] as const;
const TEMPLATE_COLUMNS = ["name", "machine_type", "active"] as const;
const ITEM_COLUMNS = ["template_id", "title", "required", "sort_order"] as const;

async function assertUniqueName(
  table: "operation_catalog" | "issue_catalog" | "service_templates",
  businessId: string,
  name: string,
  exceptId?: string
): Promise<void> {
  const wanted = foldText(name);
  const rows = await db.table(table).where("business_id").equals(businessId).toArray();
  if (rows.some((r: { id: string; name: string }) => r.id !== exceptId && foldText(r.name) === wanted)) {
    throw new CatalogRuleError(`“${name}” adı zaten kayıtlı.`);
  }
}

function checkName(name: string): string {
  const n = name.trim();
  if (!n) throw new CatalogRuleError("Ad zorunludur.");
  return n;
}

// ---------------------------------------------------------------- işlem kataloğu

export type OperationEntryInput = {
  name: string;
  category: string;
  /** kuruş */
  suggestedPriceKurus?: number;
  /** dakika */
  defaultDuration?: number;
};

function operationFields(input: OperationEntryInput) {
  if (input.suggestedPriceKurus !== undefined && (!Number.isInteger(input.suggestedPriceKurus) || input.suggestedPriceKurus < 0)) {
    throw new CatalogRuleError("Önerilen fiyat geçersiz.");
  }
  if (input.defaultDuration !== undefined && (!Number.isInteger(input.defaultDuration) || input.defaultDuration < 0)) {
    throw new CatalogRuleError("Süre geçersiz.");
  }
  return {
    name: checkName(input.name),
    category: tidy(input.category) ?? "Diğer",
    suggested_price: input.suggestedPriceKurus === undefined ? undefined : fromKurus(input.suggestedPriceKurus),
    default_duration: input.defaultDuration,
  };
}

export async function createOperationEntry(ctx: BusinessContext, input: OperationEntryInput): Promise<OperationCatalogEntry> {
  const fields = operationFields(input);
  return db.transaction("rw", db.operation_catalog, db.sync_queue, async () => {
    await assertUniqueName("operation_catalog", ctx.businessId, fields.name);
    const now = nowISO();
    const row: OperationCatalogEntry = { id: generateId(), business_id: ctx.businessId, ...fields, active: true, created_at: now, updated_at: now };
    await db.operation_catalog.add(row);
    await enqueue("operation_catalog", row.id, "INSERT", payload(row, OPERATION_COLUMNS, false), ctx.deviceCode);
    return row;
  });
}

export async function updateOperationEntry(ctx: BusinessContext, id: string, input: OperationEntryInput): Promise<OperationCatalogEntry> {
  const fields = operationFields(input);
  return db.transaction("rw", db.operation_catalog, db.sync_queue, async () => {
    const existing = await db.operation_catalog.get(id);
    if (!existing || existing.business_id !== ctx.businessId) throw new CatalogRuleError("Kayıt bulunamadı.");
    await assertUniqueName("operation_catalog", ctx.businessId, fields.name, id);
    const next: OperationCatalogEntry = { ...existing, ...fields, updated_at: nowISO() };
    await db.operation_catalog.put(next);
    await enqueue("operation_catalog", id, "UPDATE", payload(next, OPERATION_COLUMNS, true), ctx.deviceCode);
    return next;
  });
}

export async function setOperationActive(ctx: BusinessContext, id: string, active: boolean): Promise<void> {
  await db.transaction("rw", db.operation_catalog, db.sync_queue, async () => {
    const existing = await db.operation_catalog.get(id);
    if (!existing || existing.business_id !== ctx.businessId) throw new CatalogRuleError("Kayıt bulunamadı.");
    const next = { ...existing, active, updated_at: nowISO() };
    await db.operation_catalog.put(next);
    await enqueue("operation_catalog", id, "UPDATE", payload(next, OPERATION_COLUMNS, true), ctx.deviceCode);
  });
}

// ---------------------------------------------------------------- arıza kataloğu

export type IssueEntryInput = { name: string; category: string };

export async function createIssueEntry(ctx: BusinessContext, input: IssueEntryInput): Promise<IssueCatalogEntry> {
  const name = checkName(input.name);
  return db.transaction("rw", db.issue_catalog, db.sync_queue, async () => {
    await assertUniqueName("issue_catalog", ctx.businessId, name);
    const now = nowISO();
    const row: IssueCatalogEntry = {
      id: generateId(), business_id: ctx.businessId, name, category: tidy(input.category) ?? "Diğer",
      active: true, created_at: now, updated_at: now,
    };
    await db.issue_catalog.add(row);
    await enqueue("issue_catalog", row.id, "INSERT", payload(row, ISSUE_COLUMNS, false), ctx.deviceCode);
    return row;
  });
}

export async function updateIssueEntry(ctx: BusinessContext, id: string, input: IssueEntryInput): Promise<IssueCatalogEntry> {
  const name = checkName(input.name);
  return db.transaction("rw", db.issue_catalog, db.sync_queue, async () => {
    const existing = await db.issue_catalog.get(id);
    if (!existing || existing.business_id !== ctx.businessId) throw new CatalogRuleError("Kayıt bulunamadı.");
    await assertUniqueName("issue_catalog", ctx.businessId, name, id);
    const next: IssueCatalogEntry = { ...existing, name, category: tidy(input.category) ?? "Diğer", updated_at: nowISO() };
    await db.issue_catalog.put(next);
    await enqueue("issue_catalog", id, "UPDATE", payload(next, ISSUE_COLUMNS, true), ctx.deviceCode);
    return next;
  });
}

export async function setIssueActive(ctx: BusinessContext, id: string, active: boolean): Promise<void> {
  await db.transaction("rw", db.issue_catalog, db.sync_queue, async () => {
    const existing = await db.issue_catalog.get(id);
    if (!existing || existing.business_id !== ctx.businessId) throw new CatalogRuleError("Kayıt bulunamadı.");
    const next = { ...existing, active, updated_at: nowISO() };
    await db.issue_catalog.put(next);
    await enqueue("issue_catalog", id, "UPDATE", payload(next, ISSUE_COLUMNS, true), ctx.deviceCode);
  });
}

// ---------------------------------------------------------------- şablonlar

export type TemplateInput = {
  name: string;
  machineType?: string;
  items: { title: string; required: boolean }[];
};

function checkItems(items: TemplateInput["items"]) {
  const out = items.map((i) => ({ title: i.title.trim(), required: !!i.required })).filter((i) => i.title !== "");
  if (out.length === 0) throw new CatalogRuleError("Şablonda en az bir madde olmalıdır.");
  return out;
}

export async function createTemplate(ctx: BusinessContext, input: TemplateInput): Promise<ServiceTemplate> {
  const name = checkName(input.name);
  const items = checkItems(input.items);
  return db.transaction("rw", db.service_templates, db.service_template_items, db.sync_queue, async () => {
    await assertUniqueName("service_templates", ctx.businessId, name);
    const now = nowISO();
    const template: ServiceTemplate = {
      id: generateId(), business_id: ctx.businessId, name, machine_type: tidy(input.machineType),
      active: true, created_at: now, updated_at: now,
    };
    await db.service_templates.add(template);
    await enqueue("service_templates", template.id, "INSERT", payload(template, TEMPLATE_COLUMNS, false), ctx.deviceCode);
    await writeItems(ctx, template.id, items, now);
    return template;
  });
}

async function writeItems(ctx: BusinessContext, templateId: string, items: { title: string; required: boolean }[], now: string) {
  for (const [index, item] of items.entries()) {
    const row: ServiceTemplateItem = {
      id: generateId(), business_id: ctx.businessId, template_id: templateId, title: item.title,
      required: item.required, sort_order: index, created_at: now, updated_at: now,
    };
    await db.service_template_items.add(row);
    await enqueue("service_template_items", row.id, "INSERT", payload(row, ITEM_COLUMNS, false), ctx.deviceCode);
  }
}

/**
 * Şablonu günceller. Maddeler yeniden yazılır; **servislere kopyalanmış maddeler
 * değişmez** (AC-005) çünkü onlar şablon maddesine değil, kendi başlık kopyasına bağlıdır.
 */
export async function updateTemplate(ctx: BusinessContext, id: string, input: TemplateInput): Promise<ServiceTemplate> {
  const name = checkName(input.name);
  const items = checkItems(input.items);
  return db.transaction("rw", db.service_templates, db.service_template_items, db.sync_queue, async () => {
    const existing = await db.service_templates.get(id);
    if (!existing || existing.business_id !== ctx.businessId) throw new CatalogRuleError("Şablon bulunamadı.");
    await assertUniqueName("service_templates", ctx.businessId, name, id);
    const now = nowISO();
    const next: ServiceTemplate = { ...existing, name, machine_type: tidy(input.machineType), updated_at: now };
    await db.service_templates.put(next);
    await enqueue("service_templates", id, "UPDATE", payload(next, TEMPLATE_COLUMNS, true), ctx.deviceCode);

    const old = await db.service_template_items.where("template_id").equals(id).toArray();
    for (const o of old) {
      await db.service_template_items.delete(o.id);
      await enqueue("service_template_items", o.id, "DELETE", payload(o, ITEM_COLUMNS, true), ctx.deviceCode);
    }
    await writeItems(ctx, id, items, now);
    return next;
  });
}

export async function setTemplateActive(ctx: BusinessContext, id: string, active: boolean): Promise<void> {
  await db.transaction("rw", db.service_templates, db.sync_queue, async () => {
    const existing = await db.service_templates.get(id);
    if (!existing || existing.business_id !== ctx.businessId) throw new CatalogRuleError("Şablon bulunamadı.");
    const next = { ...existing, active, updated_at: nowISO() };
    await db.service_templates.put(next);
    await enqueue("service_templates", id, "UPDATE", payload(next, TEMPLATE_COLUMNS, true), ctx.deviceCode);
  });
}

export async function getTemplateItems(templateId: string): Promise<ServiceTemplateItem[]> {
  const items = await db.service_template_items.where("template_id").equals(templateId).toArray();
  return items.sort((a, b) => a.sort_order - b.sort_order);
}
