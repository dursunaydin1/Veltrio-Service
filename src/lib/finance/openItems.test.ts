import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { createProduct } from "@/lib/products/service";
import { createSale, getSaleBalance, type SaleContext } from "@/lib/sales/service";
import { addStock } from "@/lib/stock/service";
import { fifoAllocate } from "./aging";
import {
  applyCustomerCredit,
  getCustomerOpenItems,
  getUnallocatedPayments,
  openItemKey,
  recordCustomerCollection,
} from "./openItems";
import { FinanceRuleError, getCustomerBalance, reversePayment, setPartyOpeningBalance } from "./service";

const ctx: SaleContext = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

let ali: string;
let product: string;

const credit = (saleDate: string, kurus: number, dueDate?: string) =>
  createSale(
    ctx,
    { customerId: ali, saleDate, dueDate, lines: [{ productId: product, quantity: 1, unitPriceKurus: kurus, taxMode: "NONE", taxRate: 0 }] },
    { finalize: true }
  );

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
  product = (
    await createProduct(ctx, {
      name: "Buji", unit: "ADET", is_serial_tracked: false, default_sale_price: 100,
      default_tax_mode: "NONE", default_tax_rate: 0,
    })
  ).id;
  await addStock(ctx, { productId: product, quantity: 50 });
});

describe("açık kalemler ve genel tahsilat tahsisi (FR-017, AC-040)", () => {
  it("açık kalemler en eskiden yeniye listelenir; vade varsa sıralama ve yaşlandırma vadeye göre yapılır", async () => {
    const b = await credit("2026-09-20", 30000);
    const a = await credit("2026-08-01", 20000);
    const c = await credit("2026-07-01", 50000, "2026-10-30"); // eski satış ama vadesi yeni
    const open = await getCustomerOpenItems(ctx.businessId, ali);
    expect(open.items.map((i) => i.id)).toEqual([a.id, b.id, c.id]);
    expect(open.items[2]).toMatchObject({ dueDate: "2026-10-30", refDate: "2026-10-30" });
    expect(open.openKurus).toBe(100000);
    expect(open.balanceKurus).toBe(100000);
    expect(open.creditKurus).toBe(0);
  });

  it("genel tahsilat FIFO tahsisle belgelerin kalanını düşürür; bakiye ve kalemler tutarlı kalır", async () => {
    const a = await credit("2026-08-01", 20000);
    const b = await credit("2026-09-20", 30000);
    const open0 = await getCustomerOpenItems(ctx.businessId, ali);
    const parts = fifoAllocate(open0.items.map((i) => ({ key: i.key, refDate: i.refDate, remainingKurus: i.remainingKurus })), 25000);
    const allocations = parts.map((p) => {
      const item = open0.items.find((i) => i.key === p.key)!;
      return { kind: item.kind, id: item.id, amountKurus: p.amountKurus };
    });
    await recordCustomerCollection(ctx, { customerId: ali, method: "CASH", amountKurus: 25000, allocations });

    expect(await getSaleBalance(a.id)).toMatchObject({ paid: 20000, remaining: 0 });
    expect(await getSaleBalance(b.id)).toMatchObject({ paid: 5000, remaining: 25000 });
    const open = await getCustomerOpenItems(ctx.businessId, ali);
    expect(open.items.map((i) => i.id)).toEqual([b.id]);
    expect(open.openKurus).toBe(25000);
    expect(open.balanceKurus).toBe(25000);
    expect(open.creditKurus).toBe(0);
  });

  it("dağıtılmayan kısım avans olur ve ayrı gösterilir; onayla borca mahsup edilir", async () => {
    const a = await credit("2026-08-01", 20000);
    const open0 = await getCustomerOpenItems(ctx.businessId, ali);
    // 300 TL tahsilat, yalnızca 100 TL'si a'ya tahsis edilir → 200 TL avans
    await recordCustomerCollection(ctx, {
      customerId: ali, method: "CASH", amountKurus: 30000,
      allocations: [{ kind: "SALE", id: a.id, amountKurus: 10000 }],
    });
    let open = await getCustomerOpenItems(ctx.businessId, ali);
    expect(open.openKurus).toBe(10000);
    expect(open.balanceKurus).toBe(-10000);
    expect(open.creditKurus).toBe(20000);
    expect((await getUnallocatedPayments(ctx.businessId, ali)).map((p) => p.unallocatedKurus)).toEqual([20000]);
    expect(open0.items).toHaveLength(1);

    await applyCustomerCredit(ctx, ali, [{ kind: "SALE", id: a.id, amountKurus: 10000 }]);
    open = await getCustomerOpenItems(ctx.businessId, ali);
    expect(open.items).toHaveLength(0);
    expect(open.balanceKurus).toBe(-10000);
    expect(open.creditKurus).toBe(10000);
    expect((await getUnallocatedPayments(ctx.businessId, ali)).map((p) => p.unallocatedKurus)).toEqual([10000]);
    const audit = await db.audit_logs.filter((l) => l.entity_id === ali && /mahsup/i.test(l.reason ?? "")).toArray();
    expect(audit).toHaveLength(1);
  });

  it("tahsilatı ters kaydetmek tahsisleri de geri alır", async () => {
    const a = await credit("2026-08-01", 20000);
    const payment = await recordCustomerCollection(ctx, {
      customerId: ali, method: "CASH", amountKurus: 20000,
      allocations: [{ kind: "SALE", id: a.id, amountKurus: 20000 }],
    });
    expect((await getSaleBalance(a.id)).remaining).toBe(0);
    await reversePayment(ctx, payment.id, "Yanlış");
    expect((await getSaleBalance(a.id)).remaining).toBe(20000);
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(20000);
    expect((await getCustomerOpenItems(ctx.businessId, ali)).items).toHaveLength(1);
    expect(await getUnallocatedPayments(ctx.businessId, ali)).toHaveLength(0);
  });

  it("açılış bakiyesi borcu da açık kalemdir ve tahsis alabilir", async () => {
    await setPartyOpeningBalance(ctx, { partyType: "CUSTOMER", partyId: ali, direction: "OWED_BY_PARTY", amountKurus: 50000, asOfDate: "2026-01-01" });
    const open = await getCustomerOpenItems(ctx.businessId, ali);
    expect(open.items).toHaveLength(1);
    expect(open.items[0]).toMatchObject({ kind: "OPENING_BALANCE", label: "Açılış bakiyesi", remainingKurus: 50000 });
    await recordCustomerCollection(ctx, {
      customerId: ali, method: "CASH", amountKurus: 20000,
      allocations: [{ kind: "OPENING_BALANCE", id: open.items[0].id, amountKurus: 20000 }],
    });
    const after = await getCustomerOpenItems(ctx.businessId, ali);
    expect(after.items[0].remainingKurus).toBe(30000);
    expect(after.balanceKurus).toBe(30000);
  });

  it("geçersiz tahsisler reddedilir ve hiçbir ödeme yazılmaz", async () => {
    const a = await credit("2026-08-01", 20000);
    const bad = (amountKurus: number, total = 50000) =>
      recordCustomerCollection(ctx, { customerId: ali, method: "CASH", amountKurus: total, allocations: [{ kind: "SALE", id: a.id, amountKurus }] });
    await expect(bad(25000)).rejects.toThrow(/en fazla/);
    await expect(bad(20000, 10000)).rejects.toBeInstanceOf(FinanceRuleError);
    await expect(
      recordCustomerCollection(ctx, { customerId: ali, method: "CASH", amountKurus: 100, allocations: [{ kind: "SALE", id: "yok", amountKurus: 100 }] })
    ).rejects.toThrow(/açık değil/);
    expect(await db.payments.count()).toBe(0);
    expect(openItemKey("SALE", a.id)).toBe(`SALE:${a.id}`);
  });
});
