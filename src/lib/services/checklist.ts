import { db } from "@/lib/db";
import type { ServiceChecklistItem } from "@/lib/db";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import { ServiceRuleError } from "./service";

/**
 * Servis kontrol listesi (Adım 3.10, FR-009, AC-005). Şablon uygulanınca her
 * madde servise kendi başlık kopyasıyla yazılır; şablon sonradan değişse de servis
 * kopyası değişmez. Kullanıcı madde ekleyebilir, kaldırabilir, tamamlandı işaretleyebilir.
 */

const COLUMNS = [
  "service_id",
  "template_item_id",
  "title_snapshot",
  "required",
  "sort_order",
  "is_completed",
  "completed_at",
  "completed_by",
  "completed_by_device",
  "note",
  "created_at",
] as const;

function payload(item: ServiceChecklistItem, update: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { id: item.id, business_id: item.business_id };
  for (const c of COLUMNS) {
    if (update && c === "created_at") continue;
    out[c] = item[c] ?? null;
  }
  if (update) out.version = item.version ?? 1;
  return out;
}

const TABLES = () => [db.services, db.service_templates, db.service_template_items, db.service_checklist_items, db.sync_queue] as const;

async function editableService(ctx: BusinessContext, serviceId: string) {
  const service = await db.services.get(serviceId);
  if (!service || service.business_id !== ctx.businessId) throw new ServiceRuleError("Servis bulunamadı.");
  if (["DELIVERED", "CANCELLED"].includes(service.status)) {
    throw new ServiceRuleError("Teslim edilmiş veya iptal edilmiş servisin kontrol listesi değiştirilemez.");
  }
  return service;
}

export async function getChecklist(serviceId: string): Promise<ServiceChecklistItem[]> {
  const items = await db.service_checklist_items.where("service_id").equals(serviceId).toArray();
  return items.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

/** Tamamlanmamış zorunlu maddeler (İş Tamamlandı geçişi uyarısı için). */
export async function getIncompleteRequired(serviceId: string): Promise<ServiceChecklistItem[]> {
  return (await getChecklist(serviceId)).filter((i) => i.required && !i.is_completed);
}

/** Şablonun maddelerini servise kopyalar; her çağrı yeni kopyalar ekler (aynı maddeyi iki kez eklemeyi önlemek kullanıcıya bırakılır). */
export async function applyTemplate(ctx: BusinessContext, serviceId: string, templateId: string): Promise<ServiceChecklistItem[]> {
  return db.transaction("rw", [...TABLES()], async () => {
    await editableService(ctx, serviceId);
    const template = await db.service_templates.get(templateId);
    if (!template || template.business_id !== ctx.businessId) throw new ServiceRuleError("Şablon bulunamadı.");
    if (!template.active) throw new ServiceRuleError("Pasif şablon uygulanamaz.");
    const templateItems = (await db.service_template_items.where("template_id").equals(templateId).toArray()).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const existing = await getChecklist(serviceId);
    const base = existing.length;
    const now = nowISO();
    const created: ServiceChecklistItem[] = [];
    for (const [index, t] of templateItems.entries()) {
      const item: ServiceChecklistItem = {
        id: generateId(),
        business_id: ctx.businessId,
        service_id: serviceId,
        template_item_id: t.id,
        title_snapshot: t.title,
        required: t.required,
        sort_order: base + index,
        is_completed: false,
        created_at: now,
        updated_at: now,
      };
      await db.service_checklist_items.add(item);
      await enqueue("service_checklist_items", item.id, "INSERT", payload(item, false), ctx.deviceCode);
      created.push(item);
    }
    return created;
  });
}

export async function addChecklistItem(
  ctx: BusinessContext,
  serviceId: string,
  input: { title: string; required?: boolean }
): Promise<ServiceChecklistItem> {
  const title = input.title.trim();
  if (!title) throw new ServiceRuleError("Madde başlığı zorunludur.");
  return db.transaction("rw", [...TABLES()], async () => {
    await editableService(ctx, serviceId);
    const now = nowISO();
    const item: ServiceChecklistItem = {
      id: generateId(),
      business_id: ctx.businessId,
      service_id: serviceId,
      title_snapshot: title,
      required: !!input.required,
      sort_order: (await getChecklist(serviceId)).length,
      is_completed: false,
      created_at: now,
      updated_at: now,
    };
    await db.service_checklist_items.add(item);
    await enqueue("service_checklist_items", item.id, "INSERT", payload(item, false), ctx.deviceCode);
    return item;
  });
}

export async function removeChecklistItem(ctx: BusinessContext, itemId: string): Promise<void> {
  await db.transaction("rw", [...TABLES()], async () => {
    const item = await db.service_checklist_items.get(itemId);
    if (!item || item.business_id !== ctx.businessId) throw new ServiceRuleError("Madde bulunamadı.");
    await editableService(ctx, item.service_id);
    await db.service_checklist_items.delete(itemId);
    await enqueue("service_checklist_items", itemId, "DELETE", payload(item, true), ctx.deviceCode);
  });
}

/** Maddeyi tamamlandı / geri alındı işaretler; kim, hangi cihazdan ve ne zaman kaydedilir. */
export async function setChecklistItemDone(
  ctx: BusinessContext,
  itemId: string,
  done: boolean,
  note?: string
): Promise<ServiceChecklistItem> {
  return db.transaction("rw", [...TABLES()], async () => {
    const item = await db.service_checklist_items.get(itemId);
    if (!item || item.business_id !== ctx.businessId) throw new ServiceRuleError("Madde bulunamadı.");
    await editableService(ctx, item.service_id);
    const now = nowISO();
    const next: ServiceChecklistItem = {
      ...item,
      is_completed: done,
      completed_at: done ? now : undefined,
      completed_by: done ? ctx.actorId : undefined,
      completed_by_device: done ? ctx.deviceCode : undefined,
      note: note?.trim() || item.note,
      updated_at: now,
    };
    await db.service_checklist_items.put(next);
    await enqueue("service_checklist_items", itemId, "UPDATE", payload(next, true), ctx.deviceCode);
    return next;
  });
}
