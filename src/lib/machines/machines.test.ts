import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { parseMachineForm, type MachineFormInput } from "./schema";
import {
  DuplicateSerialError,
  MachineHasOpenServiceError,
  MachineRuleError,
  changeMachineOwner,
  createMachine,
  findMachinesBySerial,
  setMachineArchived,
  updateMachine,
} from "./service";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

let ali: string;
let veli: string;

const form = (over: Partial<MachineFormInput> = {}): MachineFormInput => ({
  customerId: ali,
  type: "Zincirli testere",
  brand: "Stihl",
  model: "MS 180",
  serialNumber: "SN-1001",
  year: "2022",
  notes: "",
  isTemporary: false,
  ...over,
});

function fieldsOf(over: Partial<MachineFormInput> = {}) {
  const r = parseMachineForm(form(over));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.fields;
}

beforeEach(async () => {
  for (const t of [db.customers, db.machines, db.machine_ownership_history, db.services, db.counters, db.sync_queue, db.audit_logs]) {
    await t.clear();
  }
  ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
  veli = (await createCustomer(ctx, { name: "Veli", village: "K", no_phone_flag: true })).id;
  await db.sync_queue.clear();
});

describe("parseMachineForm", () => {
  it("alanları dönüştürür", () => {
    expect(fieldsOf()).toMatchObject({ customer_id: ali, brand: "Stihl", serial_number: "SN-1001", year: 2022, is_temporary: false });
  });

  it("tür her zaman, marka ve model geçici kayıt değilse zorunlu", () => {
    const r = parseMachineForm(form({ type: " ", brand: "", model: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["brand", "model", "type"]);

    const temp = parseMachineForm(form({ brand: "", model: "", isTemporary: true }));
    expect(temp.ok).toBe(true);
  });

  it("müşteri seçilmeden ve geçersiz yılla kaydedilmez", () => {
    expect(parseMachineForm(form({ customerId: "" })).ok).toBe(false);
    expect(parseMachineForm(form({ year: "22" })).ok).toBe(false);
    expect(parseMachineForm(form({ year: "1800" })).ok).toBe(false);
    expect(parseMachineForm(form({ year: "" })).ok).toBe(true);
  });
});

describe("createMachine", () => {
  it("iç numara atar ve kuyruğa INSERT yazar; numaralar sırayla artar", async () => {
    const a = await createMachine(ctx, fieldsOf());
    const b = await createMachine(ctx, fieldsOf({ serialNumber: "SN-2" }));
    expect(a.internal_number).toBe("MK-DEMO-AB23-00001");
    expect(b.internal_number).toBe("MK-DEMO-AB23-00002");

    const queue = await db.sync_queue.toArray();
    expect(queue.map((q) => q.operation)).toEqual(["INSERT", "INSERT"]);
    const first = queue.find((q) => q.record_id === a.id);
    expect(first?.payload).toMatchObject({ customer_id: ali, internal_number: "MK-DEMO-AB23-00001", is_temporary: false });
  });

  it("seri numarasız makine de açılır, iç numarası vardır", async () => {
    const m = await createMachine(ctx, fieldsOf({ serialNumber: "" }));
    expect(m.serial_number).toBeUndefined();
    expect(m.internal_number).toBeTruthy();
  });

  it("aynı marka + seri numarasını (harf/Türkçe karakter fark etmeden) uyarır, onayla devam edilir (AC-029)", async () => {
    const first = await createMachine(ctx, fieldsOf({ serialNumber: "AbC-1", brand: "Stihl" }));
    const err = await createMachine(ctx, fieldsOf({ serialNumber: "abc-1", brand: "STIHL" })).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateSerialError);
    expect(err.existing.id).toBe(first.id);

    await expect(createMachine(ctx, fieldsOf({ serialNumber: "abc-1", brand: "STIHL" }), { allowDuplicateSerial: true })).resolves.toBeTruthy();
    expect(await db.machines.count()).toBe(2);
  });

  it("farklı markada aynı seri numarası mükerrer sayılmaz", async () => {
    await createMachine(ctx, fieldsOf({ serialNumber: "X1", brand: "Stihl" }));
    await expect(createMachine(ctx, fieldsOf({ serialNumber: "X1", brand: "Husqvarna" }))).resolves.toBeTruthy();
  });

  it("olmayan müşteriye makine açılamaz", async () => {
    await expect(createMachine(ctx, fieldsOf({ customerId: "yok" }))).rejects.toBeInstanceOf(MachineRuleError);
    expect(await db.machines.count()).toBe(0);
  });
});

describe("updateMachine", () => {
  it("geçici kaydı tamamlayıp etkin makineye çevirir; içerik aynıysa yazmaz", async () => {
    const temp = await createMachine(ctx, fieldsOf({ brand: "", model: "", serialNumber: "", isTemporary: true }));

    const { customer_id: _owner, ...rest } = fieldsOf({ brand: "Stihl", model: "MS 180", serialNumber: "", isTemporary: false });
    void _owner;
    const updated = await updateMachine(ctx, temp.id, rest);
    expect(updated).toMatchObject({ is_temporary: false, brand: "Stihl" });

    // bekleyen INSERT paketine birleşti
    const queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0].operation).toBe("INSERT");

    await db.sync_queue.clear();
    await updateMachine(ctx, temp.id, rest);
    expect(await db.sync_queue.count()).toBe(0);
  });

  it("seri numarası başka makineyle çakışırsa uyarır; sahibi değişmez", async () => {
    await createMachine(ctx, fieldsOf({ serialNumber: "A1" }));
    const b = await createMachine(ctx, fieldsOf({ serialNumber: "B1", customerId: veli }));
    const { customer_id: _o, ...rest } = fieldsOf({ serialNumber: "A1", customerId: ali });
    void _o;

    await expect(updateMachine(ctx, b.id, rest)).rejects.toBeInstanceOf(DuplicateSerialError);
    expect((await db.machines.get(b.id))?.customer_id).toBe(veli);
  });
});

describe("changeMachineOwner (AC-018)", () => {
  it("geçmişe yazar, makineyi yeni sahibe bağlar, audit log ekler", async () => {
    const m = await createMachine(ctx, fieldsOf());
    await db.sync_queue.clear();
    await db.machines.put({ ...m, version: 2 });

    await changeMachineOwner(ctx, m.id, veli, "Makine satıldı");

    expect((await db.machines.get(m.id))?.customer_id).toBe(veli);
    const [h] = await db.machine_ownership_history.toArray();
    expect(h).toMatchObject({ machine_id: m.id, old_customer_id: ali, new_customer_id: veli, reason: "Makine satıldı", actor_id: "u1" });

    const queue = await db.sync_queue.toArray();
    expect(queue.map((q) => q.table_name).sort()).toEqual(["audit_logs", "machine_ownership_history", "machines"]);
    expect(queue.find((q) => q.table_name === "machines")?.payload).toMatchObject({ customer_id: veli, version: 2 });
    expect((await db.audit_logs.toArray())[0]).toMatchObject({ entity_type: "machines", reason: "Makine satıldı" });
  });

  it("neden zorunlu; aynı sahibe veya olmayan müşteriye devredilemez", async () => {
    const m = await createMachine(ctx, fieldsOf());
    await expect(changeMachineOwner(ctx, m.id, veli, " ")).rejects.toBeInstanceOf(MachineRuleError);
    await expect(changeMachineOwner(ctx, m.id, ali, "x")).rejects.toBeInstanceOf(MachineRuleError);
    await expect(changeMachineOwner(ctx, m.id, "yok", "x")).rejects.toBeInstanceOf(MachineRuleError);
    expect(await db.machine_ownership_history.count()).toBe(0);
  });

  it("arka arkaya devirde geçmiş sırayla birikir", async () => {
    const m = await createMachine(ctx, fieldsOf());
    await changeMachineOwner(ctx, m.id, veli, "Satıldı");
    await changeMachineOwner(ctx, m.id, ali, "Geri alındı");
    const history = (await db.machine_ownership_history.toArray()).sort((a, b) => a.changed_at.localeCompare(b.changed_at));
    expect(history.map((h) => [h.old_customer_id, h.new_customer_id])).toEqual([[ali, veli], [veli, ali]]);
  });
});

describe("setMachineArchived (FR-033)", () => {
  const service = (machineId: string, status: string) => ({
    id: `s-${status}`, business_id: ctx.businessId, document_no: `S-${status}`, machine_id: machineId,
    status, deposit_amount: 0, labor_fee: 0, total_amount: 0, received_date: "2026-01-01T00:00:00Z",
    is_warranty_claim: false, created_by_device: "X", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  });

  it("açık servisi olan makine arşivlenemez", async () => {
    const m = await createMachine(ctx, fieldsOf());
    await db.services.add(service(m.id, "IN_PROGRESS") as never);
    await expect(setMachineArchived(ctx, m.id, true)).rejects.toBeInstanceOf(MachineHasOpenServiceError);
  });

  it("kapalı servisli makine arşivlenir, audit yazılır, mükerrer aramasından çıkar, geri açılır", async () => {
    const m = await createMachine(ctx, fieldsOf({ serialNumber: "Z9" }));
    await db.services.add(service(m.id, "DELIVERED") as never);

    await setMachineArchived(ctx, m.id, true, "Hurdaya çıktı");
    expect((await db.machines.get(m.id))?.archived_at).toBeTruthy();
    expect(await db.audit_logs.count()).toBe(1);
    expect(await findMachinesBySerial(ctx.businessId, "Stihl", "Z9")).toHaveLength(0);

    await setMachineArchived(ctx, m.id, false);
    expect((await db.machines.get(m.id))?.archived_at).toBeUndefined();
  });
});
