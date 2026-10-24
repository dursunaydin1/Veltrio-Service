import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { openService } from "@/lib/services/service";
import { MachineRuleError, createMachine, mergeTemporaryMachine } from "./service";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

let ali: string;
let veli: string;

const machine = (customer: string, over = {}) =>
  createMachine(ctx, { customer_id: customer, type: "Testere", brand: "Stihl", model: "MS", is_temporary: false, ...over });

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
  veli = (await createCustomer(ctx, { name: "Veli", village: "K", no_phone_flag: true })).id;
});

describe("geçici makineyi birleştirme (SR-016, AC-051)", () => {
  it("servisler hedef makineye taşınır, geçici kayıt arşivlenir ve hedefe bağlanır; hiçbir kayıt silinmez", async () => {
    const real = await machine(ali, { serial_number: "SN-1" });
    const temp = await machine(ali, { is_temporary: true, brand: undefined, model: undefined });
    const s1 = await openService(ctx, { customerId: ali, machineId: temp.id, complaint: "x" });
    await db.sync_queue.clear();

    const merged = await mergeTemporaryMachine(ctx, temp.id, real.id, "Aynı makine");
    expect(merged).toMatchObject({ merged_into_id: real.id });
    expect(merged.archived_at).toBeTruthy();
    expect((await db.services.get(s1.id))?.machine_id).toBe(real.id);
    expect(await db.machines.get(temp.id)).toBeTruthy();

    const queue = await db.sync_queue.toArray();
    expect(queue.find((q) => q.table_name === "services")?.payload).toMatchObject({ machine_id: real.id, version: 1 });
    expect(queue.find((q) => q.table_name === "machines")?.payload).toMatchObject({ merged_into_id: real.id });
    const audit = await db.audit_logs.filter((a) => a.entity_id === temp.id).toArray();
    expect(audit[0]).toMatchObject({ reason: "Aynı makine" });
  });

  it("neden zorunlu; geçici olmayan, farklı müşterili, geçici hedefli veya tekrar birleştirme reddedilir", async () => {
    const real = await machine(ali);
    const temp = await machine(ali, { is_temporary: true, brand: undefined, model: undefined });
    const otherTemp = await machine(ali, { is_temporary: true, brand: undefined, model: undefined });
    const veliMachine = await machine(veli);

    await expect(mergeTemporaryMachine(ctx, temp.id, real.id, " ")).rejects.toThrow(/neden/i);
    await expect(mergeTemporaryMachine(ctx, real.id, temp.id, "x")).rejects.toBeInstanceOf(MachineRuleError);
    await expect(mergeTemporaryMachine(ctx, temp.id, veliMachine.id, "x")).rejects.toThrow(/aynı müşteri/i);
    await expect(mergeTemporaryMachine(ctx, temp.id, otherTemp.id, "x")).rejects.toThrow(/geçici/i);
    await mergeTemporaryMachine(ctx, temp.id, real.id, "x");
    await expect(mergeTemporaryMachine(ctx, temp.id, real.id, "x")).rejects.toBeInstanceOf(MachineRuleError);
  });
});
