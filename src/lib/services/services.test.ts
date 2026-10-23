import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer, setCustomerArchived } from "@/lib/customers/service";
import { getCustomerBalance } from "@/lib/finance/service";
import { createMachine } from "@/lib/machines/service";
import {
  ServiceRuleError,
  changeServiceStatus,
  getMachineServiceSummary,
  openService,
  updateServiceDetails,
} from "./service";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

let ali: string;
let veli: string;
let machine: string;

beforeEach(async () => {
  for (const t of [
    db.customers, db.machines, db.services, db.service_status_history, db.payments,
    db.counters, db.sync_queue, db.audit_logs, db.opening_balances, db.sales,
  ]) {
    await t.clear();
  }
  ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
  veli = (await createCustomer(ctx, { name: "Veli", village: "K", no_phone_flag: true })).id;
  machine = (
    await createMachine(ctx, { customer_id: ali, type: "Zincirli testere", brand: "Stihl", model: "MS 180", is_temporary: false })
  ).id;
  await db.sync_queue.clear();
});

const open = (over = {}) =>
  openService(ctx, { customerId: ali, machineId: machine, complaint: "Çalışmıyor", ...over });

describe("openService (§5.1)", () => {
  it("S-…-sıra numarası ve RECEIVED durumuyla servis açar, geçmişe ilk kaydı yazar", async () => {
    const s = await open({ existingDamage: "Sol kapakta çizik", accessories: "Zincir kılıfı", promisedDate: "2026-11-05" });

    expect(s.document_no).toMatch(/^S-DEMO-AB23-\d{4}-00001$/);
    expect(s).toMatchObject({
      status: "RECEIVED",
      customer_id: ali,
      machine_id: machine,
      existing_damage: "Sol kapakta çizik",
      received_accessories: "Zincir kılıfı",
      promised_date: "2026-11-05",
      deposit_amount: 0,
    });

    const [h] = await db.service_status_history.toArray();
    expect(h).toMatchObject({ service_id: s.id, to_status: "RECEIVED", actor_id: "u1" });
    expect(h.from_status).toBeUndefined();

    const queue = await db.sync_queue.toArray();
    expect(queue.map((q) => q.table_name).sort()).toEqual(["service_status_history", "services"]);
    expect(queue.find((q) => q.table_name === "services")?.payload).toMatchObject({
      document_no: s.document_no, status: "RECEIVED", cancel_reason: null,
      // Sunucuda NOT NULL: null gönderilirse yeni servis eşitlenemez
      debt_acknowledged: false,
    });
  });

  it("numaralar sırayla artar", async () => {
    const a = await open();
    const b = await open();
    expect(a.document_no.endsWith("00001")).toBe(true);
    expect(b.document_no.endsWith("00002")).toBe(true);
  });

  it("şikâyet zorunlu; makine ya da geçici makine türü gerekir", async () => {
    await expect(open({ complaint: "  " })).rejects.toBeInstanceOf(ServiceRuleError);
    await expect(openService(ctx, { customerId: ali, complaint: "x" })).rejects.toBeInstanceOf(ServiceRuleError);
    await expect(open({ promisedDate: "05.11.2026" })).rejects.toBeInstanceOf(ServiceRuleError);
    expect(await db.services.count()).toBe(0);
  });

  it("makine bilinmiyorsa geçici makine açar ve ona bağlar (SR-016)", async () => {
    const s = await openService(ctx, { customerId: veli, temporaryMachineType: "Tırpan", complaint: "Güç kaybı" });
    const m = await db.machines.get(s.machine_id as string);
    expect(m).toMatchObject({ type: "Tırpan", is_temporary: true, customer_id: veli });
    expect(m?.internal_number).toBeTruthy();
  });

  it("başka müşterinin makinesiyle, arşivli müşteriyle veya arşivli makineyle servis açılamaz", async () => {
    await expect(open({ customerId: veli })).rejects.toThrow(/müşteriye ait değil/);
    await db.machines.update(machine, { archived_at: new Date().toISOString() });
    await expect(open()).rejects.toThrow(/Arşivlenmiş makine/);
    await db.machines.update(machine, { archived_at: undefined });
    await setCustomerArchived(ctx, veli, true);
    await expect(openService(ctx, { customerId: veli, temporaryMachineType: "Tırpan", complaint: "x" })).rejects.toThrow(/Arşivlenmiş müşteri/);
  });

  it("kapora servise bağlı tahsilat olur ve müşteri bakiyesini düşürür (SR-018)", async () => {
    const s = await open({ deposit: { amountKurus: 50000, method: "CASH" } });
    expect(s.deposit_amount).toBe(500);

    const [p] = await db.payments.toArray();
    expect(p).toMatchObject({ direction: "IN", amount: 500, source_type: "SERVICE", source_id: s.id, customer_id: ali });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(-50000);
  });

  it("işlem yarım kalırsa hiçbir şey yazılmaz (geçersiz kapora)", async () => {
    await expect(open({ deposit: { amountKurus: 0, method: "CASH" } })).rejects.toThrow();
    expect(await db.services.count()).toBe(0);
    expect(await db.service_status_history.count()).toBe(0);
    expect(await db.payments.count()).toBe(0);
  });
});

describe("changeServiceStatus (§6.1, AC-017, AC-033)", () => {
  const history = async (id: string) =>
    (await db.service_status_history.where("service_id").equals(id).toArray()).sort((a, b) => a.changed_at.localeCompare(b.changed_at));

  it("izinli geçişleri uygular, her adımı geçmişe yazar", async () => {
    const s = await open();
    await changeServiceStatus(ctx, s.id, "DIAGNOSED");
    await changeServiceStatus(ctx, s.id, "IN_PROGRESS");
    await changeServiceStatus(ctx, s.id, "COMPLETED");
    const done = await changeServiceStatus(ctx, s.id, "DELIVERED");

    expect(done.status).toBe("DELIVERED");
    expect(done.completed_date).toBeTruthy();
    expect(done.delivered_date).toBeTruthy();
    const h = await db.service_status_history.where("service_id").equals(s.id).toArray();
    expect(h.map((x) => x.to_status).sort()).toEqual(["COMPLETED", "DELIVERED", "DIAGNOSED", "IN_PROGRESS", "RECEIVED"]);
  });

  it("geçersiz geçişi anlaşılır mesajla reddeder, durum değişmez", async () => {
    const s = await open();
    await expect(changeServiceStatus(ctx, s.id, "COMPLETED")).rejects.toThrow(/geçilemez/);
    expect((await db.services.get(s.id))?.status).toBe("RECEIVED");
    expect(await db.service_status_history.where("service_id").equals(s.id).count()).toBe(1);
  });

  it("iptal nedensiz yapılamaz; nedenle yapılınca iptal nedeni ve audit log kaydedilir", async () => {
    const s = await open();
    await expect(changeServiceStatus(ctx, s.id, "CANCELLED", " ")).rejects.toBeInstanceOf(ServiceRuleError);

    const c = await changeServiceStatus(ctx, s.id, "CANCELLED", "Müşteri vazgeçti");
    expect(c).toMatchObject({ status: "CANCELLED", cancel_reason: "Müşteri vazgeçti" });
    expect((await history(s.id)).at(-1)).toMatchObject({ to_status: "CANCELLED", note: "Müşteri vazgeçti" });
    expect(await db.audit_logs.count()).toBe(1);
    await expect(changeServiceStatus(ctx, s.id, "RECEIVED")).rejects.toThrow(/geçilemez/);
  });

  it("teslim edilmiş servis iptal edilemez (AC-033)", async () => {
    const s = await open();
    for (const to of ["DIAGNOSED", "IN_PROGRESS", "COMPLETED", "DELIVERED"] as const) {
      await changeServiceStatus(ctx, s.id, to);
    }
    await expect(changeServiceStatus(ctx, s.id, "CANCELLED", "Hata")).rejects.toThrow(/geçilemez/);
  });

  it("yeniden açma neden ister; ilk tamamlanma zamanı korunur, sayaç ikinci kez artmaz (SR-009)", async () => {
    const s = await open();
    for (const to of ["DIAGNOSED", "IN_PROGRESS", "COMPLETED"] as const) await changeServiceStatus(ctx, s.id, to);
    const firstDone = (await db.services.get(s.id))?.first_completed_at;
    expect(firstDone).toBeTruthy();

    await expect(changeServiceStatus(ctx, s.id, "IN_PROGRESS")).rejects.toBeInstanceOf(ServiceRuleError);
    const reopened = await changeServiceStatus(ctx, s.id, "IN_PROGRESS", "Müşteri tekrar şikâyet etti");
    expect(reopened.completed_date).toBeUndefined();
    expect(reopened.first_completed_at).toBe(firstDone);

    await changeServiceStatus(ctx, s.id, "COMPLETED");
    expect((await db.services.get(s.id))?.first_completed_at).toBe(firstDone);
    expect((await getMachineServiceSummary(machine)).completedCount).toBe(1);
  });

  it("iptal edilen servis sayaçtan düşer", async () => {
    const s = await open();
    for (const to of ["DIAGNOSED", "IN_PROGRESS", "COMPLETED"] as const) await changeServiceStatus(ctx, s.id, to);
    expect((await getMachineServiceSummary(machine)).completedCount).toBe(1);
    await changeServiceStatus(ctx, s.id, "CANCELLED", "Hatalı kayıt");
    expect((await getMachineServiceSummary(machine)).completedCount).toBe(0);
  });

  it("tamamlanan servis tutarı müşteri bakiyesine yansır (kesinleşmiş ücretli servis)", async () => {
    const s = await open();
    await db.services.update(s.id, { total_amount: 750 });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);
    for (const to of ["DIAGNOSED", "IN_PROGRESS", "COMPLETED"] as const) await changeServiceStatus(ctx, s.id, to);
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(75000);
  });

  it("açık servisi olan makine ve müşteri arşivlenemez, teslimden sonra arşivlenir", async () => {
    const s = await open();
    await expect(setCustomerArchived(ctx, ali, true)).rejects.toThrow(/Açık servisi/);
    await changeServiceStatus(ctx, s.id, "CANCELLED", "Vazgeçti");
    await expect(setCustomerArchived(ctx, ali, true)).resolves.toBeTruthy();
  });

  it("değişiklik sürümle kuyruğa yazılır; bekleyen INSERT varsa birleşir", async () => {
    const s = await open();
    await changeServiceStatus(ctx, s.id, "DIAGNOSED");
    const services = (await db.sync_queue.toArray()).filter((q) => q.table_name === "services");
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({ operation: "INSERT" });
    expect(services[0].payload.status).toBe("DIAGNOSED");

    await db.sync_queue.clear();
    await db.services.put({ ...(await db.services.get(s.id))!, version: 4 });
    await changeServiceStatus(ctx, s.id, "IN_PROGRESS");
    const upd = (await db.sync_queue.toArray()).find((q) => q.table_name === "services");
    expect(upd).toMatchObject({ operation: "UPDATE" });
    expect(upd?.payload).toMatchObject({ version: 4, status: "IN_PROGRESS" });
    expect(upd?.payload).not.toHaveProperty("document_no");
  });
});

describe("updateServiceDetails & özet", () => {
  it("teşhis ve yapılan işi kaydeder; içerik aynıysa yazmaz; iptal edilmiş servis düzenlenemez", async () => {
    const s = await open();
    await db.sync_queue.clear();
    await db.services.put({ ...s, version: 2 });

    const base = { customer_complaint: "Çalışmıyor" };
    await updateServiceDetails(ctx, s.id, { ...base, diagnosis: "Buji ölmüş", resolution: "Buji değişti" });
    expect(await db.services.get(s.id)).toMatchObject({ diagnosis: "Buji ölmüş", resolution: "Buji değişti" });
    expect(await db.sync_queue.count()).toBe(1);

    await db.sync_queue.clear();
    await updateServiceDetails(ctx, s.id, { ...base, diagnosis: "Buji ölmüş", resolution: "Buji değişti" });
    expect(await db.sync_queue.count()).toBe(0);

    await expect(updateServiceDetails(ctx, s.id, { customer_complaint: " " })).rejects.toBeInstanceOf(ServiceRuleError);

    await changeServiceStatus(ctx, s.id, "CANCELLED", "Vazgeçti");
    await expect(updateServiceDetails(ctx, s.id, base)).rejects.toThrow(/edilmiş servis düzenlenemez/);
  });

  it("makine özeti son servisi ve tamamlanan sayısını verir", async () => {
    const first = await open({ complaint: "Birinci" });
    for (const to of ["DIAGNOSED", "IN_PROGRESS", "COMPLETED", "DELIVERED"] as const) await changeServiceStatus(ctx, first.id, to);
    await new Promise((r) => setTimeout(r, 5));
    const second = await open({ complaint: "İkinci" });

    const summary = await getMachineServiceSummary(machine);
    expect(summary.completedCount).toBe(1);
    expect(summary.lastService?.id).toBe(second.id);
  });
});
