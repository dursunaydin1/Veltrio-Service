import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { createMachine } from "@/lib/machines/service";
import {
  addChecklistItem,
  applyTemplate,
  getChecklist,
  getIncompleteRequired,
  removeChecklistItem,
  setChecklistItemDone,
} from "@/lib/services/checklist";
import { ChecklistIncompleteError, changeServiceStatus, openService, type ServiceContext } from "@/lib/services/service";
import {
  CatalogRuleError,
  createIssueEntry,
  createOperationEntry,
  createTemplate,
  getTemplateItems,
  setIssueActive,
  setOperationActive,
  setTemplateActive,
  updateOperationEntry,
  updateTemplate,
} from "./service";

const ctx: ServiceContext = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
});

describe("işlem ve arıza katalogları (FR-009)", () => {
  it("ekler, düzenler, pasifleştirir; aynı ad (harf/Türkçe karakter farkı olsa da) tekrar eklenemez", async () => {
    const op = await createOperationEntry(ctx, { name: "Karbüratör ayarı", category: "Karbüratör", suggestedPriceKurus: 35000, defaultDuration: 30 });
    expect(op).toMatchObject({ name: "Karbüratör ayarı", suggested_price: 350, default_duration: 30, active: true });
    await expect(createOperationEntry(ctx, { name: "KARBURATOR AYARI", category: "Diğer" })).rejects.toBeInstanceOf(CatalogRuleError);

    const edited = await updateOperationEntry(ctx, op.id, { name: "Karbüratör temizliği", category: "Karbüratör", suggestedPriceKurus: 40000 });
    expect(edited).toMatchObject({ name: "Karbüratör temizliği", suggested_price: 400 });

    await setOperationActive(ctx, op.id, false);
    expect((await db.operation_catalog.get(op.id))?.active).toBe(false);

    const issue = await createIssueEntry(ctx, { name: "Çalışmıyor", category: "Çalışmıyor" });
    await setIssueActive(ctx, issue.id, false);
    expect((await db.issue_catalog.get(issue.id))?.active).toBe(false);
    await expect(createIssueEntry(ctx, { name: "  ", category: "Diğer" })).rejects.toThrow(/zorunlu/);
  });

  it("katalog değişiklikleri eşitleme kuyruğuna sürümle yazılır", async () => {
    const op = await createOperationEntry(ctx, { name: "Buji değişimi", category: "Buji" });
    await db.sync_queue.clear();
    await updateOperationEntry(ctx, op.id, { name: "Buji değişimi", category: "Buji", suggestedPriceKurus: 5000 });
    const [q] = await db.sync_queue.toArray();
    expect(q).toMatchObject({ table_name: "operation_catalog", operation: "UPDATE" });
    expect(q.payload).toMatchObject({ name: "Buji değişimi", suggested_price: 50, version: 1 });
  });
});

describe("şablon ve kontrol listesi (FR-009, AC-005)", () => {
  let serviceId: string;

  beforeEach(async () => {
    const customerId = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
    const machineId = (await createMachine(ctx, { customer_id: customerId, type: "Testere", brand: "Stihl", model: "MS", is_temporary: false })).id;
    serviceId = (await openService(ctx, { customerId, machineId, complaint: "x" })).id;
  });

  const template = () =>
    createTemplate(ctx, {
      name: "Yıllık bakım",
      machineType: "Testere",
      items: [
        { title: "Hava filtresi temizle", required: true },
        { title: "Zincir yağı kontrol", required: false },
        { title: "  ", required: true },
      ],
    });

  it("şablon boş maddeleri atar, en az bir madde ister", async () => {
    const t = await template();
    expect((await getTemplateItems(t.id)).map((i) => i.title)).toEqual(["Hava filtresi temizle", "Zincir yağı kontrol"]);
    await expect(createTemplate(ctx, { name: "Boş", items: [{ title: " ", required: false }] })).rejects.toThrow(/en az bir madde/);
  });

  it("şablon uygulanınca maddeler servise kopyalanır; şablon sonradan değişse kopya değişmez (AC-005)", async () => {
    const t = await template();
    const copied = await applyTemplate(ctx, serviceId, t.id);
    expect(copied.map((c) => [c.title_snapshot, c.required])).toEqual([["Hava filtresi temizle", true], ["Zincir yağı kontrol", false]]);

    await updateTemplate(ctx, t.id, { name: "Yıllık bakım v2", items: [{ title: "Tamamen yeni madde", required: true }] });
    expect((await getChecklist(serviceId)).map((c) => c.title_snapshot)).toEqual(["Hava filtresi temizle", "Zincir yağı kontrol"]);
    expect((await getTemplateItems(t.id)).map((i) => i.title)).toEqual(["Tamamen yeni madde"]);
  });

  it("pasif şablon uygulanamaz; kullanıcı madde ekler, kaldırır, tamamlar (kim/ne zaman kaydolur)", async () => {
    const t = await template();
    await setTemplateActive(ctx, t.id, false);
    await expect(applyTemplate(ctx, serviceId, t.id)).rejects.toThrow(/Pasif/);

    const item = await addChecklistItem(ctx, serviceId, { title: "Ek kontrol", required: true });
    const done = await setChecklistItemDone(ctx, item.id, true);
    expect(done).toMatchObject({ is_completed: true, completed_by: "u1", completed_by_device: "DEMO-AB23" });
    expect(done.completed_at).toBeTruthy();
    const undone = await setChecklistItemDone(ctx, item.id, false);
    expect(undone.completed_at).toBeUndefined();
    await removeChecklistItem(ctx, item.id);
    expect(await getChecklist(serviceId)).toHaveLength(0);
  });

  it("zorunlu madde tamamlanmadan iş tamamlanamaz (uyarı); onaylanırsa geçilir, tamamlanırsa uyarı çıkmaz", async () => {
    const item = await addChecklistItem(ctx, serviceId, { title: "Yağ kontrolü", required: true });
    await addChecklistItem(ctx, serviceId, { title: "İsteğe bağlı", required: false });
    for (const to of ["DIAGNOSED", "IN_PROGRESS"] as const) await changeServiceStatus(ctx, serviceId, to);

    const err = await changeServiceStatus(ctx, serviceId, "COMPLETED").catch((e) => e);
    expect(err).toBeInstanceOf(ChecklistIncompleteError);
    expect(err.titles).toEqual(["Yağ kontrolü"]);
    expect((await getIncompleteRequired(serviceId)).map((i) => i.title_snapshot)).toEqual(["Yağ kontrolü"]);

    await setChecklistItemDone(ctx, item.id, true);
    await expect(changeServiceStatus(ctx, serviceId, "COMPLETED")).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("uyarı kullanıcı onayıyla (ignoreChecklist) aşılabilir", async () => {
    await addChecklistItem(ctx, serviceId, { title: "Yağ kontrolü", required: true });
    for (const to of ["DIAGNOSED", "IN_PROGRESS"] as const) await changeServiceStatus(ctx, serviceId, to);
    await expect(changeServiceStatus(ctx, serviceId, "COMPLETED", undefined, { ignoreChecklist: true })).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("teslim edilmiş / iptal servisin listesi değiştirilemez", async () => {
    await changeServiceStatus(ctx, serviceId, "CANCELLED", "vazgeçti");
    await expect(addChecklistItem(ctx, serviceId, { title: "x" })).rejects.toThrow(/değiştirilemez/);
  });
});
