import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { getCustomerBalance } from "@/lib/finance/service";
import { createMachine } from "@/lib/machines/service";
import { createProduct } from "@/lib/products/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { addStock } from "@/lib/stock/service";
import { addOperation, addPart, recordApproval, setPartUsedQuantity } from "@/lib/services/quote";
import { changeServiceStatus, deliverService, getServiceBalance, openService, type ServiceContext } from "@/lib/services/service";
import { ReturnRuleError, reverseReturn } from "./service";
import { createServiceReturn, getReturnablePartQuantity, refundCancelledServicePayment } from "./service-return";

const ctx: ServiceContext = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

let ali: string;
let machine: string;
let buji: string;

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
  machine = (await createMachine(ctx, { customer_id: ali, type: "Testere", brand: "Stihl", model: "MS", is_temporary: false })).id;
  buji = (
    await createProduct(ctx, {
      name: "NGK Buji", unit: "ADET", is_serial_tracked: false, default_sale_price: 100,
      default_tax_mode: "NONE", default_tax_rate: 0,
    })
  ).id;
  await addStock(ctx, { productId: buji, quantity: 10, unitCost: 40 });
});

/** 1.000 ₺ işçilik + 2 × 100 ₺ stok parçası; tamamlanmış servis. */
async function completed(deposit?: number) {
  const s = await openService(ctx, {
    customerId: ali, machineId: machine, complaint: "x",
    deposit: deposit ? { amountKurus: deposit, method: "CASH" } : undefined,
  });
  const op = await addOperation(ctx, s.id, { description: "Bakım", unitPriceKurus: 100000, taxMode: "NONE", taxRate: 0 });
  const part = await addPart(ctx, s.id, { sourceType: "STOCK_PRODUCT", productId: buji, quantity: 2 });
  await recordApproval(ctx, s.id, {
    decisions: [{ kind: "operation", id: op.id, decision: "APPROVED" }, { kind: "part", id: part.id, decision: "APPROVED" }],
    method: "IN_PERSON",
  });
  for (const to of ["DIAGNOSED", "IN_PROGRESS"] as const) await changeServiceStatus(ctx, s.id, to);
  await setPartUsedQuantity(ctx, part.id, 2);
  await changeServiceStatus(ctx, s.id, "COMPLETED");
  return { service: s, part };
}

describe("teslim sonrası servis iadesi / düzeltmesi (AC-014)", () => {
  it("parça iadesi: stok geri girer, tutar düşer, ödenmişse fazla kısım nakden çıkar", async () => {
    const { service, part } = await completed();
    await deliverService(ctx, service.id, { payment: { amountKurus: 120000, method: "CASH" } });
    expect(await getProductBalance(buji)).toMatchObject({ available: 8 });
    expect(await getReturnablePartQuantity(part.id)).toBe(2);

    const ret = await createServiceReturn(ctx, {
      serviceId: service.id, reason: "Parça uymadı", refundMethod: "CASH",
      lines: [{ servicePartId: part.id, quantity: 1, disposition: "SELLABLE" }],
    });
    expect(ret).toMatchObject({ original_type: "SERVICE", total_amount: 100, status: "POSTED" });
    expect(ret.refund_payment_id).toBeTruthy();
    expect(await getProductBalance(buji)).toMatchObject({ available: 9 });
    expect(await getServiceBalance(service.id)).toMatchObject({ total: 110000, paid: 110000, returned: 10000, remaining: 0 });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);
    expect(await getReturnablePartQuantity(part.id)).toBe(1);
  });

  it("borçlu teslimde iade nakit çıkarmaz, borcu düşürür; ücret düzeltmesi parçasız yapılabilir", async () => {
    const { service } = await completed();
    await deliverService(ctx, service.id, { debtAcknowledged: true });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(120000);

    const ret = await createServiceReturn(ctx, {
      serviceId: service.id, reason: "İşçilik indirimi", refundMethod: "CASH", extraAmountKurus: 20000,
    });
    expect(ret.refund_payment_id).toBeUndefined();
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(100000);
    await expect(
      createServiceReturn(ctx, { serviceId: service.id, reason: "x", refundMethod: "CASH", extraAmountKurus: 999999 })
    ).rejects.toThrow(/aşamaz/);
  });

  it("teslim edilmemiş servise iade yapılamaz; neden ve içerik zorunlu; hasarlı parça hasarlı stoğa girer", async () => {
    const { service, part } = await completed();
    const l = [{ servicePartId: part.id, quantity: 1, disposition: "SELLABLE" as const }];
    await expect(createServiceReturn(ctx, { serviceId: service.id, reason: "x", refundMethod: "CASH", lines: l })).rejects.toBeInstanceOf(ReturnRuleError);
    await deliverService(ctx, service.id, { payment: { amountKurus: 120000, method: "CASH" } });
    await expect(createServiceReturn(ctx, { serviceId: service.id, reason: " ", refundMethod: "CASH", lines: l })).rejects.toThrow(/neden/i);
    await expect(createServiceReturn(ctx, { serviceId: service.id, reason: "x", refundMethod: "CASH" })).rejects.toBeInstanceOf(ReturnRuleError);
    await createServiceReturn(ctx, {
      serviceId: service.id, reason: "kırık", refundMethod: "CARD",
      lines: [{ servicePartId: part.id, quantity: 1, disposition: "DAMAGED" }],
    });
    expect(await getProductBalance(buji)).toMatchObject({ available: 8, damaged: 1 });
    await expect(
      createServiceReturn(ctx, { serviceId: service.id, reason: "x", refundMethod: "CASH", lines: [{ servicePartId: part.id, quantity: 2, disposition: "SELLABLE" }] })
    ).rejects.toThrow(/en fazla 1/);
  });

  it("iadeyi geri alma stoğu ve ödemeyi eski hâline getirir", async () => {
    const { service, part } = await completed();
    await deliverService(ctx, service.id, { payment: { amountKurus: 120000, method: "CASH" } });
    const ret = await createServiceReturn(ctx, {
      serviceId: service.id, reason: "x", refundMethod: "CASH",
      lines: [{ servicePartId: part.id, quantity: 2, disposition: "SELLABLE" }],
    });
    expect(await getProductBalance(buji)).toMatchObject({ available: 10 });
    await reverseReturn(ctx, ret.id, "Yanlış");
    expect(await getProductBalance(buji)).toMatchObject({ available: 8 });
    expect(await getServiceBalance(service.id)).toMatchObject({ total: 120000, paid: 120000, remaining: 0 });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);
  });
});

describe("teslim öncesi iptal: kapora iadesi (SR-017)", () => {
  it("iptal edilen servisin kaporası müşteri alacağı olur; iade edilirse alacak kapanır; fazlası iade edilemez", async () => {
    const s = await openService(ctx, {
      customerId: ali, machineId: machine, complaint: "x",
      deposit: { amountKurus: 30000, method: "CASH" },
    });
    await expect(refundCancelledServicePayment(ctx, s.id, { amountKurus: 100, method: "CASH" })).rejects.toThrow(/iptal/);
    await changeServiceStatus(ctx, s.id, "CANCELLED", "Vazgeçti");
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(-30000);
    expect(await getServiceBalance(s.id)).toMatchObject({ total: 0, paid: 30000, remaining: -30000 });

    await expect(refundCancelledServicePayment(ctx, s.id, { amountKurus: 40000, method: "CASH" })).rejects.toThrow(/en fazla/);
    await refundCancelledServicePayment(ctx, s.id, { amountKurus: 30000, method: "CASH" });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);
    expect(await getServiceBalance(s.id)).toMatchObject({ paid: 0, remaining: 0 });
  });
});
