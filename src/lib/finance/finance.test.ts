import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { balanceState, calcCustomerBalance } from "./balance";
import {
  FinanceRuleError,
  getCustomerBalance,
  recordCustomerPayment,
  reversePayment,
  reversedPaymentIds,
  setCustomerOpeningBalance,
} from "./service";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

describe("calcCustomerBalance (§9.3)", () => {
  it("formül: açılış + satış/servis − tahsilat − iade + müşteriye ödeme", () => {
    const r = calcCustomerBalance({
      openingBalances: [{ direction: "OWED_BY_PARTY", amount: 500 }],
      charges: [1000, 250.5],
      payments: [
        { direction: "IN", amount: 400 },
        { direction: "OUT", amount: 50 },
      ],
      returns: [100],
    });
    // 500 + 1250,50 − 400 − 100 + 50 = 1300,50
    expect(r.balance).toBe(130050);
    expect(r).toMatchObject({ opening: 50000, charged: 125050, received: 40000, paidOut: 5000, returned: 10000 });
  });

  it("işletmenin müşteriye borcu (OWED_TO_PARTY) ve fazla ödeme negatif bakiye verir", () => {
    const credit = calcCustomerBalance({
      openingBalances: [{ direction: "OWED_TO_PARTY", amount: 200 }],
      charges: [],
      payments: [],
      returns: [],
    });
    expect(credit.balance).toBe(-20000);
    expect(balanceState(credit.balance)).toBe("CREDIT");

    const overpaid = calcCustomerBalance({ openingBalances: [], charges: [100], payments: [{ direction: "IN", amount: 150 }], returns: [] });
    expect(overpaid.balance).toBe(-5000);
  });

  it("kuruş hassasiyeti: 0,1 + 0,2 tahsilatı 0,3 borcu kapatır", () => {
    const r = calcCustomerBalance({
      openingBalances: [],
      charges: [0.3],
      payments: [
        { direction: "IN", amount: 0.1 },
        { direction: "IN", amount: 0.2 },
      ],
      returns: [],
    });
    expect(r.balance).toBe(0);
    expect(balanceState(r.balance)).toBe("CLEAR");
  });
});

describe("ödeme servisi", () => {
  let customerId: string;

  beforeEach(async () => {
    for (const t of [db.customers, db.payments, db.payment_allocations, db.opening_balances, db.sales, db.services, db.sync_queue, db.audit_logs]) {
      await t.clear();
    }
    const c = await createCustomer(ctx, {
      name: "Ali", village: "Köy", no_phone_flag: true,
    });
    customerId = c.id;
    await db.sync_queue.clear();
  });

  const collect = (amountKurus: number, over = {}) =>
    recordCustomerPayment(ctx, { customerId, direction: "IN", method: "CASH", amountKurus, ...over });

  it("tahsilat kaydeder, bakiyeyi düşürür ve INSERT olarak kuyruğa yazar", async () => {
    await setCustomerOpeningBalance(ctx, { customerId, direction: "OWED_BY_PARTY", amountKurus: 100000, asOfDate: "2026-10-01" });
    await db.sync_queue.clear();

    const p = await collect(25050, { note: "Peşinat" });
    expect(p).toMatchObject({ amount: 250.5, status: "VALID", direction: "IN" });
    expect((await getCustomerBalance(ctx.businessId, customerId)).balance).toBe(74950);

    const [q] = await db.sync_queue.toArray();
    expect(q).toMatchObject({ table_name: "payments", operation: "INSERT" });
    expect(q.payload).toMatchObject({ customer_id: customerId, method: "CASH", reversal_of_id: null, supplier_id: null });
  });

  it("sıfır, negatif veya kesirli kuruşu reddeder; başka işletmenin müşterisine ödeme yazılamaz", async () => {
    await expect(collect(0)).rejects.toBeInstanceOf(FinanceRuleError);
    await expect(collect(-5)).rejects.toBeInstanceOf(FinanceRuleError);
    await expect(collect(10.5)).rejects.toBeInstanceOf(FinanceRuleError);
    await expect(recordCustomerPayment({ ...ctx, businessId: "baska" }, { customerId, direction: "IN", method: "CASH", amountKurus: 100 })).rejects.toBeInstanceOf(FinanceRuleError);
    expect(await db.payments.count()).toBe(0);
  });

  it("müşteriye ödeme (OUT) alacağı kapatır", async () => {
    await setCustomerOpeningBalance(ctx, { customerId, direction: "OWED_TO_PARTY", amountKurus: 30000, asOfDate: "2026-10-01" });
    await recordCustomerPayment(ctx, { customerId, direction: "OUT", method: "CASH", amountKurus: 30000 });
    expect((await getCustomerBalance(ctx.businessId, customerId)).balance).toBe(0);
  });

  it("ters kayıt: orijinal silinmez, karşı yönlü kayıt eklenir, bakiye eski haline döner, audit yazılır", async () => {
    const original = await collect(10000);
    expect((await getCustomerBalance(ctx.businessId, customerId)).balance).toBe(-10000);

    const reversal = await reversePayment(ctx, original.id, "Yanlış müşteri");
    expect(reversal).toMatchObject({ direction: "OUT", status: "REVERSED", reversal_of_id: original.id, amount: 100 });
    expect(await db.payments.count()).toBe(2);
    expect(await db.payments.get(original.id)).toMatchObject({ status: "VALID" });
    expect((await getCustomerBalance(ctx.businessId, customerId)).balance).toBe(0);

    const payments = await db.payments.toArray();
    expect([...reversedPaymentIds(payments)]).toEqual([original.id]);
    const [log] = await db.audit_logs.toArray();
    expect(log).toMatchObject({ entity_type: "payments", entity_id: original.id, reason: "Yanlış müşteri" });
  });

  it("ters kayıt nedensiz, iki kez veya ters kaydın tersi olarak yapılamaz", async () => {
    const original = await collect(10000);
    await expect(reversePayment(ctx, original.id, "  ")).rejects.toBeInstanceOf(FinanceRuleError);

    const reversal = await reversePayment(ctx, original.id, "Hata");
    await expect(reversePayment(ctx, original.id, "Tekrar")).rejects.toThrow(/zaten ters/);
    await expect(reversePayment(ctx, reversal.id, "Tersin tersi")).rejects.toThrow(/tekrar ters/);
    expect(await db.payments.count()).toBe(2);
  });

  it("ters kayıt, ödemeye bağlı tahsisleri de aynı tutarla ters çevirir", async () => {
    const original = await collect(10000);
    await db.payment_allocations.add({
      id: "a1", business_id: ctx.businessId, payment_id: original.id,
      source_type: "SALE", source_id: "s1", allocated_amount: 100, created_at: new Date().toISOString(),
    });
    const reversal = await reversePayment(ctx, original.id, "Hata");

    const copies = await db.payment_allocations.where("payment_id").equals(reversal.id).toArray();
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ source_type: "SALE", source_id: "s1", allocated_amount: 100 });
  });

  it("satış ve servis tutarları bakiyeye girer: yalnızca FINAL satış ve tamamlanmış (iptal olmayan) servis", async () => {
    const t = new Date().toISOString();
    const sale = (id: string, status: string, total: number) => ({
      id, business_id: ctx.businessId, document_no: id, customer_id: customerId, sale_date: t,
      subtotal: total, discount_total: 0, tax_total: 0, total_amount: total, status,
      created_by_device: "X", created_at: t, updated_at: t,
    });
    const service = (id: string, status: string, total: number, done: boolean) => ({
      id, business_id: ctx.businessId, document_no: id, customer_id: customerId, status,
      deposit_amount: 0, labor_fee: 0, total_amount: total, received_date: t,
      first_completed_at: done ? t : undefined, is_warranty_claim: false,
      created_by_device: "X", created_at: t, updated_at: t,
    });
    await db.sales.bulkAdd([sale("s1", "FINAL", 1000), sale("s2", "DRAFT", 500), sale("s3", "CANCELLED", 700)] as never);
    await db.services.bulkAdd([
      service("v1", "DELIVERED", 300, true),
      service("v2", "IN_PROGRESS", 400, false),
      service("v3", "CANCELLED", 200, true),
    ] as never);

    const b = await getCustomerBalance(ctx.businessId, customerId);
    expect(b.charged).toBe(130000); // 1000 + 300
    expect(b.balance).toBe(130000);
  });
});

describe("açılış bakiyesi", () => {
  let customerId: string;

  beforeEach(async () => {
    for (const t of [db.customers, db.opening_balances, db.payments, db.sales, db.services, db.sync_queue, db.audit_logs]) {
      await t.clear();
    }
    customerId = (await createCustomer(ctx, { name: "Veli", village: "Köy", no_phone_flag: true })).id;
    await db.sync_queue.clear();
  });

  it("ilk kayıt neden istemez; audit log'a CREATE yazılır, sahte satış/ödeme oluşmaz", async () => {
    await setCustomerOpeningBalance(ctx, { customerId, direction: "OWED_BY_PARTY", amountKurus: 50000, asOfDate: "2026-10-01", note: "Defterden" });
    expect(await db.opening_balances.count()).toBe(1);
    expect(await db.sales.count()).toBe(0);
    expect(await db.payments.count()).toBe(0);
    expect((await db.audit_logs.toArray())[0]).toMatchObject({ action: "CREATE", entity_type: "opening_balances" });
  });

  it("değiştirmek için neden zorunlu; tek kayıt güncellenir, eski/yeni değer audit'e yazılır", async () => {
    const base = { customerId, direction: "OWED_BY_PARTY" as const, asOfDate: "2026-10-01" };
    await setCustomerOpeningBalance(ctx, { ...base, amountKurus: 50000 });

    await expect(setCustomerOpeningBalance(ctx, { ...base, amountKurus: 70000 })).rejects.toBeInstanceOf(FinanceRuleError);

    await setCustomerOpeningBalance(ctx, { ...base, amountKurus: 70000, reason: "Defter yanlış okunmuş" });
    expect(await db.opening_balances.count()).toBe(1);
    expect((await getCustomerBalance(ctx.businessId, customerId)).opening).toBe(70000);

    const logs = await db.audit_logs.toArray();
    expect(logs.find((l) => l.action === "UPDATE")).toMatchObject({
      action: "UPDATE",
      reason: "Defter yanlış okunmuş",
      old_value: { amount: 500 },
      new_value: { amount: 700 },
    });
  });

  it("geçersiz tutar ve tarihi reddeder", async () => {
    const base = { customerId, direction: "OWED_BY_PARTY" as const };
    await expect(setCustomerOpeningBalance(ctx, { ...base, amountKurus: -1, asOfDate: "2026-10-01" })).rejects.toBeInstanceOf(FinanceRuleError);
    await expect(setCustomerOpeningBalance(ctx, { ...base, amountKurus: 100, asOfDate: "01.10.2026" })).rejects.toBeInstanceOf(FinanceRuleError);
  });
});
