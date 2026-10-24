import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { createMachine } from "@/lib/machines/service";
import { createProduct } from "@/lib/products/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { addStock } from "@/lib/stock/service";
import { addOperation, addPart, recordApproval, setPartUsedQuantity } from "./quote";
import { changeServiceStatus, getServiceBalance, openService, updateServiceDetails, type ServiceContext } from "./service";

const ctx: ServiceContext = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

let customerId: string;
let machineId: string;

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  customerId = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
  machineId = (
    await createMachine(ctx, { customer_id: customerId, type: "Testere", brand: "Stihl", model: "MS", is_temporary: false, warranty_until: "2027-01-01" })
  ).id;
});

describe("garanti işlemleri (SR-011, TC-009)", () => {
  it("garanti talebi kaynak ve kapsamla açılır; makine kartındaki garanti bitişi saklanır", async () => {
    expect((await db.machines.get(machineId))?.warranty_until).toBe("2027-01-01");
    const s = await openService(ctx, {
      customerId, machineId, complaint: "x", warranty: { source: " Üretici ", coverage: "Karbüratör" },
    });
    expect(s).toMatchObject({ is_warranty_claim: true, warranty_source: "Üretici", warranty_coverage: "Karbüratör" });
    const queued = (await db.sync_queue.toArray()).find((q) => q.table_name === "services");
    expect(queued?.payload).toMatchObject({ is_warranty_claim: true, warranty_source: "Üretici", warranty_coverage: "Karbüratör" });
  });

  it("garanti bayrağı sonradan değiştirilebilir; kapatılınca kaynak ve kapsam temizlenir", async () => {
    const s = await openService(ctx, { customerId, machineId, complaint: "x" });
    expect(s.is_warranty_claim).toBe(false);
    const on = await updateServiceDetails(ctx, s.id, { customer_complaint: "x", is_warranty_claim: true, warranty_source: "Bayi" });
    expect(on).toMatchObject({ is_warranty_claim: true, warranty_source: "Bayi" });
    const off = await updateServiceDetails(ctx, s.id, { customer_complaint: "x", is_warranty_claim: false });
    expect(off).toMatchObject({ is_warranty_claim: false });
    expect(off.warranty_source).toBeUndefined();
  });

  it("garanti kapsamında müşteri ücreti sıfır olabilir; kullanılan parça yine stoktan düşer ve maliyeti kaydedilir", async () => {
    const product = await createProduct(ctx, {
      name: "Karbüratör", unit: "ADET", is_serial_tracked: false, default_sale_price: 500, last_purchase_price: 300,
      default_tax_mode: "NONE", default_tax_rate: 0,
    });
    await addStock(ctx, { productId: product.id, quantity: 3, unitCost: 300 });
    const s = await openService(ctx, { customerId, machineId, complaint: "x", warranty: { source: "Üretici" } });
    const op = await addOperation(ctx, s.id, { description: "Karbüratör değişimi", unitPriceKurus: 0, taxMode: "NONE", taxRate: 0 });
    const part = await addPart(ctx, s.id, { sourceType: "STOCK_PRODUCT", productId: product.id, quantity: 1, unitPriceKurus: 0, taxMode: "NONE", taxRate: 0 });
    await recordApproval(ctx, s.id, {
      decisions: [{ kind: "operation", id: op.id, decision: "APPROVED" }, { kind: "part", id: part.id, decision: "APPROVED" }],
      method: "IN_PERSON",
    });
    for (const to of ["DIAGNOSED", "IN_PROGRESS"] as const) await changeServiceStatus(ctx, s.id, to);
    await setPartUsedQuantity(ctx, part.id, 1);
    await changeServiceStatus(ctx, s.id, "COMPLETED");

    expect(await getServiceBalance(s.id)).toMatchObject({ total: 0, remaining: 0 });
    expect((await getProductBalance(product.id)).available).toBe(2);
    const movement = (await db.stock_movements.toArray()).find((m) => m.movement_type === "SERVICE_USE");
    expect(movement).toMatchObject({ quantity: -1, unit_cost: 300 });
  });
});
