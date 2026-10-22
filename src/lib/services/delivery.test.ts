import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { getCustomerBalance, reversePayment } from "@/lib/finance/service";
import { createMachine } from "@/lib/machines/service";
import { createProduct } from "@/lib/products/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { addStock } from "@/lib/stock/service";
import { addOperation, addPart, recordApproval, setPartUsedQuantity } from "./quote";
import {
  ServiceRuleError,
  changeServiceStatus,
  collectServicePayment,
  deliverService,
  getServiceBalance,
  openService,
  type ServiceContext,
} from "./service";

const ctx: ServiceContext = {
  businessId: "00000000-0000-0000-0000-000000000001",
  deviceCode: "DEMO-AB23",
  actorId: "u1",
  approvalThreshold: 1000,
};

let ali: string;
let machine: string;

beforeEach(async () => {
  for (const t of [
    db.customers, db.machines, db.services, db.service_status_history, db.service_operations,
    db.service_parts, db.service_approvals, db.payments, db.opening_balances, db.sales,
    db.products, db.stock_movements, db.counters, db.sync_queue, db.audit_logs,
  ]) {
    await t.clear();
  }
  ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
  machine = (await createMachine(ctx, { customer_id: ali, type: "Testere", brand: "Stihl", model: "MS", is_temporary: false })).id;
});

/** 1.000 ₺'lik onaylı işlemle "İş tamamlandı" durumuna getirilmiş servis. */
async function completedService(deposit?: number) {
  const s = await openService(ctx, {
    customerId: ali, machineId: machine, complaint: "x",
    deposit: deposit ? { amountKurus: deposit, method: "CASH" } : undefined,
  });
  const op = await addOperation(ctx, s.id, { description: "Bakım", unitPriceKurus: 100000, taxMode: "NONE", taxRate: 0 });
  await recordApproval(ctx, s.id, { decisions: [{ kind: "operation", id: op.id, decision: "APPROVED" }], method: "IN_PERSON" });
  for (const to of ["DIAGNOSED", "IN_PROGRESS", "COMPLETED"] as const) await changeServiceStatus(ctx, s.id, to);
  return s;
}

const stockProduct = (name: string, price: number) =>
  createProduct(ctx, {
    name, unit: "ADET", is_serial_tracked: false, default_sale_price: price,
    default_tax_mode: "NONE", default_tax_rate: 0,
  });

describe("faturalanan stok parçası kullanılmadan iş tamamlanamaz", () => {
  it("kullanıldı işaretlenene kadar engeller; sonra tamamlanır ve stok düşer", async () => {
    const p = await stockProduct("NGK Buji", 125.5);
    await addStock(ctx, { productId: p.id, quantity: 5 });
    const s = await openService(ctx, { customerId: ali, machineId: machine, complaint: "x" });
    const part = await addPart(ctx, s.id, { sourceType: "STOCK_PRODUCT", productId: p.id, quantity: 1 });
    await changeServiceStatus(ctx, s.id, "DIAGNOSED");
    await changeServiceStatus(ctx, s.id, "IN_PROGRESS");

    await expect(changeServiceStatus(ctx, s.id, "COMPLETED")).rejects.toThrow(/NGK Buji/);
    expect((await getProductBalance(p.id)).available).toBe(5);

    await setPartUsedQuantity(ctx, part.id, 1);
    await expect(changeServiceStatus(ctx, s.id, "COMPLETED")).resolves.toMatchObject({ status: "COMPLETED" });
    expect((await getProductBalance(p.id)).available).toBe(4);
  });

  it("müşterinin getirdiği ve stok dışı parçalar kullanım işareti istemez", async () => {
    const s = await openService(ctx, { customerId: ali, machineId: machine, complaint: "x" });
    await addPart(ctx, s.id, { sourceType: "CUSTOMER_SUPPLIED", description: "Kendi bujisi", quantity: 1 });
    await addPart(ctx, s.id, { sourceType: "NON_STOCK_PURCHASE", description: "Conta", quantity: 1, unitPriceKurus: 1000 });
    await changeServiceStatus(ctx, s.id, "DIAGNOSED");
    await changeServiceStatus(ctx, s.id, "IN_PROGRESS");
    await expect(changeServiceStatus(ctx, s.id, "COMPLETED")).resolves.toBeTruthy();
  });

  it("reddedilen parça kullanım gerektirmez", async () => {
    const p = await stockProduct("Zincir", 50);
    await addStock(ctx, { productId: p.id, quantity: 2 });
    const s = await openService(ctx, { customerId: ali, machineId: machine, complaint: "x" });
    const part = await addPart(ctx, s.id, { sourceType: "STOCK_PRODUCT", productId: p.id, quantity: 1 });
    await recordApproval(ctx, s.id, { decisions: [{ kind: "part", id: part.id, decision: "REJECTED" }], method: "PHONE" });
    await changeServiceStatus(ctx, s.id, "DIAGNOSED");
    await changeServiceStatus(ctx, s.id, "IN_PROGRESS");
    await expect(changeServiceStatus(ctx, s.id, "COMPLETED")).resolves.toBeTruthy();
  });
});

describe("getServiceBalance", () => {
  it("tutar − net ödeme; kapora ve tahsilat sayılır, ters kayıt geri alır", async () => {
    const s = await completedService(30000);
    expect(await getServiceBalance(s.id)).toEqual({ total: 100000, paid: 30000, remaining: 70000 });

    const pay = await collectServicePayment(ctx, s.id, { amountKurus: 20000, method: "CARD" });
    expect((await getServiceBalance(s.id)).remaining).toBe(50000);

    await reversePayment(ctx, pay.id, "Hatalı giriş");
    expect((await getServiceBalance(s.id)).remaining).toBe(70000);
  });

  it("başka belgeye bağlı ödemeler servis bakiyesine girmez", async () => {
    const s = await completedService();
    await db.payments.add({
      id: "genel", business_id: ctx.businessId, direction: "IN", method: "CASH", amount: 500,
      payment_date: new Date().toISOString(), customer_id: ali, status: "VALID",
      created_by_device: "X", created_at: new Date().toISOString(),
    });
    expect((await getServiceBalance(s.id)).paid).toBe(0);
  });
});

describe("deliverService (§5.2, AC-025, AC-033)", () => {
  const lastHistory = async (serviceId: string) =>
    (await db.service_status_history.where("service_id").equals(serviceId).toArray())
      .sort((a, b) => b.changed_at.localeCompare(a.changed_at))[0];

  it("kalan bakiye yoksa teslim eder; teslim alan kişi ve tarih kaydedilir", async () => {
    const s = await completedService();
    const r = await deliverService(ctx, s.id, {
      payment: { amountKurus: 100000, method: "CASH" },
      receiverName: "Oğlu Mehmet",
    });
    expect(r).toMatchObject({ status: "DELIVERED", delivered_to: "Oğlu Mehmet", delivery_balance: 0, debt_acknowledged: false });
    expect(r.delivered_date).toBeTruthy();
    expect(await lastHistory(s.id)).toMatchObject({ to_status: "DELIVERED", note: "Teslim alan: Oğlu Mehmet" });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);
  });

  it("borçlu teslim: kabul işaretlenmeden teslim edilmez ve tahsilat da kaydedilmez", async () => {
    const s = await completedService();
    await expect(
      deliverService(ctx, s.id, { payment: { amountKurus: 40000, method: "CASH" } })
    ).rejects.toThrow(/Kalan bakiye 600,00/);

    expect((await db.services.get(s.id))?.status).toBe("COMPLETED");
    expect(await db.payments.count()).toBe(0);
  });

  it("borçlu teslim kabulle yapılır: kalan tutar ve kabul kaydedilir, müşteri bakiyesi borçlu kalır", async () => {
    const s = await completedService(10000);
    const r = await deliverService(ctx, s.id, {
      payment: { amountKurus: 40000, method: "CASH" },
      debtAcknowledged: true,
    });

    expect(r).toMatchObject({ status: "DELIVERED", delivery_balance: 500, debt_acknowledged: true });
    expect((await lastHistory(s.id)).note).toMatch(/Borçlu teslim: kalan 500,00/);
    // 1.000 − 100 kapora − 400 teslim tahsilatı = 500
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(50000);
  });

  it("fazla ödeme borç sayılmaz; kabul gerekmez, fazlalık müşteri alacağı olur", async () => {
    const s = await completedService();
    const r = await deliverService(ctx, s.id, { payment: { amountKurus: 120000, method: "BANK_TRANSFER" } });
    expect(r).toMatchObject({ status: "DELIVERED", delivery_balance: 0, debt_acknowledged: false });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(-20000);
  });

  it("yalnızca 'İş tamamlandı' durumundaki servis teslim edilir", async () => {
    const s = await openService(ctx, { customerId: ali, machineId: machine, complaint: "x" });
    await expect(deliverService(ctx, s.id)).rejects.toBeInstanceOf(ServiceRuleError);
  });

  it("teslim edilen servis iptal edilemez; yeniden açılınca teslim bilgileri temizlenir", async () => {
    const s = await completedService();
    await deliverService(ctx, s.id, { payment: { amountKurus: 100000, method: "CASH" }, receiverName: "Ahmet" });
    await expect(changeServiceStatus(ctx, s.id, "CANCELLED", "Hata")).rejects.toThrow(/geçilemez/);

    const reopened = await changeServiceStatus(ctx, s.id, "IN_PROGRESS", "Tekrar arıza");
    expect(reopened).toMatchObject({
      delivered_date: undefined,
      delivered_to: undefined,
      delivery_balance: undefined,
      debt_acknowledged: false,
    });
  });

  it("teslim bilgileri sunucuya sürümle gider", async () => {
    const s = await completedService();
    await db.sync_queue.clear();
    await db.services.put({ ...(await db.services.get(s.id))!, version: 6 });

    await deliverService(ctx, s.id, { payment: { amountKurus: 100000, method: "CASH" }, receiverName: "Ahmet" });
    const q = (await db.sync_queue.toArray()).find((x) => x.table_name === "services");
    expect(q).toMatchObject({ operation: "UPDATE" });
    expect(q?.payload).toMatchObject({ version: 6, status: "DELIVERED", delivered_to: "Ahmet", delivery_balance: 0, debt_acknowledged: false });
  });
});
