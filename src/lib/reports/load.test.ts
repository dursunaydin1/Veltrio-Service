import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { createMachine } from "@/lib/machines/service";
import { createProduct } from "@/lib/products/service";
import { createSaleReturn } from "@/lib/returns/service";
import { cancelFinalSale, createSale, getSaleItems, type SaleContext } from "@/lib/sales/service";
import { addStock } from "@/lib/stock/service";
import { addOperation, recordApproval } from "@/lib/services/quote";
import { changeServiceStatus, deliverService, openService } from "@/lib/services/service";
import { todayLocalDate } from "@/lib/utils";
import { loadActiveServices, loadCollections, loadCustomerStatement, loadMachineHistory, loadSalesReport, loadServiceRevenue, loadStockReport } from "./load";

const ctx: SaleContext = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };
const today = todayLocalDate();
const range = { from: `${today.slice(0, 7)}-01`, to: today };

let ali: string;
let buji: string;

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
  buji = (await createProduct(ctx, { name: "Buji", unit: "ADET", is_serial_tracked: false, default_sale_price: 100, default_tax_mode: "NONE", default_tax_rate: 0, critical_stock_level: 3 })).id;
  await addStock(ctx, { productId: buji, quantity: 10 });
});

describe("raporlar birbirinden ayrı hesaplanır (AC-023, TC-025)", () => {
  it("veresiye satış satış raporunda var, tahsilat raporunda yok; iade ve iptal net satıştan düşer", async () => {
    // 400 TL satış, 100 TL peşin → 300 TL veresiye
    const veresiye = await createSale(ctx, { customerId: ali, lines: [{ productId: buji, quantity: 4, unitPriceKurus: 10000, taxMode: "NONE", taxRate: 0 }] }, { finalize: true, payment: { amountKurus: 10000, method: "CASH" } });
    const [item] = await getSaleItems(veresiye.id);
    await createSaleReturn(ctx, { saleId: veresiye.id, reason: "x", refundMethod: "CUSTOMER_CREDIT", lines: [{ saleItemId: item.id, quantity: 1, disposition: "SELLABLE" }] });
    // ayrı 100 TL satış iptal edilir
    const iptal = await createSale(ctx, { lines: [{ productId: buji, quantity: 1, unitPriceKurus: 10000, taxMode: "NONE", taxRate: 0 }] }, { finalize: true, payment: { amountKurus: 10000, method: "CARD" } });
    await cancelFinalSale(ctx, iptal.id, "hata");

    const sales = await loadSalesReport(ctx.businessId, range, "month");
    expect(sales.totals).toMatchObject({ count: 2, gross: 50000, returns: 10000, cancelled: 10000, net: 30000 });

    const collections = await loadCollections(ctx.businessId, range, "month");
    // Alınan: 100 nakit + 100 kart; iade/ters: 100 kart (iptal). Veresiye 300 TL tahsilat değildir.
    expect(collections.totals).toEqual({ received: 20000, refunded: 10000, net: 10000 });
    expect(collections.byMethod.map((m) => [m.method, m.net])).toEqual([["CARD", 0], ["CASH", 10000]]);
  });

  it("servis geliri tahsilattan bağımsız tahakkuktur; yeniden açılan servis iki kez sayılmaz", async () => {
    const machine = (await createMachine(ctx, { customer_id: ali, type: "Testere", brand: "Stihl", model: "MS", is_temporary: false })).id;
    const s = await openService(ctx, { customerId: ali, machineId: machine, complaint: "x" });
    const op = await addOperation(ctx, s.id, { description: "Bakım", unitPriceKurus: 50000, taxMode: "NONE", taxRate: 0 });
    await recordApproval(ctx, s.id, { decisions: [{ kind: "operation", id: op.id, decision: "APPROVED" }], method: "IN_PERSON" });
    for (const to of ["DIAGNOSED", "IN_PROGRESS", "COMPLETED"] as const) await changeServiceStatus(ctx, s.id, to);
    await deliverService(ctx, s.id, { debtAcknowledged: true }); // hiç tahsilat yok
    await changeServiceStatus(ctx, s.id, "IN_PROGRESS", "ek iş"); // yeniden aç
    await changeServiceStatus(ctx, s.id, "COMPLETED");

    const revenue = await loadServiceRevenue(ctx.businessId, range, "month");
    expect(revenue.totals).toMatchObject({ count: 1, revenue: 50000, net: 50000 });
    expect((await loadCollections(ctx.businessId, range, "month")).totals.received).toBe(0);

    const history = await loadMachineHistory(ctx.businessId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ completedCount: 1, owner: "Ali" });
    expect(history[0].services[0].summary).toBe("Bakım");
  });

  it("aktif servisler, stok raporu ve hesap ekstresi tutarlı", async () => {
    const machine = (await createMachine(ctx, { customer_id: ali, type: "Testere", brand: "Stihl", model: "MS", is_temporary: false })).id;
    await openService(ctx, { customerId: ali, machineId: machine, complaint: "x", promisedDate: "2020-01-01" });
    const active = await loadActiveServices(ctx.businessId);
    expect(active).toHaveLength(1);
    expect(active[0].daysOverdue).toBeGreaterThan(0);
    expect(await loadActiveServices(ctx.businessId, { status: "DELIVERED" })).toHaveLength(0);

    await createSale(ctx, { customerId: ali, lines: [{ productId: buji, quantity: 8, unitPriceKurus: 10000, taxMode: "NONE", taxRate: 0 }] }, { finalize: true, payment: { amountKurus: 30000, method: "CASH" } });
    const stock = await loadStockReport(ctx.businessId, range);
    expect(stock[0]).toMatchObject({ productId: buji, available: 2, critical: true, inQty: 10, outQty: 8 });

    const statement = await loadCustomerStatement(ctx.businessId, ali);
    expect(statement.map((l) => [l.kind, l.balance])).toEqual([["Satış", 80000], ["Tahsilat", 50000]]);
  });
});
