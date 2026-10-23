import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { getCustomerBalance } from "@/lib/finance/service";
import { createMachine } from "@/lib/machines/service";
import { createProduct } from "@/lib/products/service";
import type { ProductFields } from "@/lib/products/schema";
import { createPurchase } from "@/lib/purchases/service";
import { getInStockUnits } from "@/lib/serial/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { addStock } from "@/lib/stock/service";
import { createSupplier } from "@/lib/suppliers/service";
import { SaleRuleError, cancelFinalSale, createSale, getSaleBalance, type SaleContext } from "./service";

const ctx: SaleContext = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

const base: Omit<ProductFields, "name"> = {
  unit: "ADET",
  is_serial_tracked: false,
  default_sale_price: 100,
  default_tax_mode: "NONE",
  default_tax_rate: 0,
};
const line = (productId: string, quantity: number, unitPriceKurus: number, over = {}) => ({
  productId, quantity, unitPriceKurus, taxMode: "NONE" as const, taxRate: 0, ...over,
});

let buji: string;
let ali: string;

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  buji = (await createProduct(ctx, { ...base, name: "NGK Buji" })).id;
  await addStock(ctx, { productId: buji, quantity: 10, unitCost: 40 });
  ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
});

describe("kesinleşmiş satış iptali (AC-044)", () => {
  it("stok geri döner, tahsilat ters kaydolur, belge silinmez ve bakiye sıfırlanır", async () => {
    const sale = await createSale(ctx, { customerId: ali, lines: [line(buji, 3, 10000)] }, {
      finalize: true, payment: { amountKurus: 10000, method: "CASH" },
    });
    expect((await getProductBalance(buji)).available).toBe(7);
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(20000);

    const cancelled = await cancelFinalSale(ctx, sale.id, "Yanlış girildi");
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancel_reason: "Yanlış girildi" });
    expect(await db.sales.get(sale.id)).toBeTruthy();
    expect((await getProductBalance(buji)).available).toBe(10);
    expect((await getSaleBalance(sale.id)).paid).toBe(0);
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);

    const reversal = await db.stock_movements.filter((m) => m.movement_type === "CANCEL_REVERSAL").toArray();
    expect(reversal).toHaveLength(1);
    expect(reversal[0].reversal_of_id).toBeTruthy();
    const audit = await db.audit_logs.filter((a) => a.entity_id === sale.id).toArray();
    expect(audit.some((a) => a.reason === "Yanlış girildi")).toBe(true);
  });

  it("neden zorunlu; taslak veya iptal edilmiş satış bu yolla iptal edilemez; ikinci iptal reddedilir", async () => {
    const draft = await createSale(ctx, { lines: [line(buji, 1, 10000)] }, { finalize: false });
    await expect(cancelFinalSale(ctx, draft.id, "x")).rejects.toBeInstanceOf(SaleRuleError);
    const sale = await createSale(ctx, { lines: [line(buji, 1, 10000)] }, { finalize: true, payment: { amountKurus: 10000, method: "CASH" } });
    await expect(cancelFinalSale(ctx, sale.id, "  ")).rejects.toThrow(/neden/i);
    await cancelFinalSale(ctx, sale.id, "Hata");
    await expect(cancelFinalSale(ctx, sale.id, "Tekrar")).rejects.toBeInstanceOf(SaleRuleError);
    expect((await getProductBalance(buji)).available).toBe(10);
  });
});

async function stockMachine() {
  const machineProduct = (
    await createProduct(ctx, { ...base, name: "Testere", brand: "Stihl", model: "MS 1", category: "Testere", is_serial_tracked: true })
  ).id;
  const supplier = (await createSupplier(ctx, { name: "Tedarikçi" })).id;
  await createPurchase(
    ctx,
    { supplierId: supplier, lines: [line(machineProduct, 1, 400000, { serialNumbers: ["SN-1"] })] },
    { receive: true }
  );
  const [unit] = await getInStockUnits(machineProduct);
  return { machineProduct, unit };
}

describe("makine satışı iptali", () => {
  it("birim stokta döner, makine kaydı arşivlenir ve yeniden satılabilir", async () => {
    const { machineProduct, unit } = await stockMachine();
    const sale = await createSale(ctx, { customerId: ali, lines: [line(machineProduct, 1, 600000, { serialUnitId: unit.id })] }, {
      finalize: true, payment: { amountKurus: 600000, method: "CASH" },
    });
    const sold = await db.product_serial_units.get(unit.id);
    expect(sold?.status).toBe("SOLD");
    const machineId = sold!.machine_id!;

    await cancelFinalSale(ctx, sale.id, "Müşteri vazgeçti, kayıt hatalı");
    const back = await db.product_serial_units.get(unit.id);
    expect(back).toMatchObject({ status: "IN_STOCK" });
    expect(back?.machine_id).toBeUndefined();
    expect((await getProductBalance(machineProduct)).available).toBe(1);
    const machine = await db.machines.get(machineId);
    expect(machine?.sale_id).toBeUndefined();
    expect(machine?.archived_at).toBeTruthy();
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);

    const again = await createSale(ctx, { customerId: ali, lines: [line(machineProduct, 1, 600000, { serialUnitId: unit.id })] }, { finalize: true, payment: { amountKurus: 600000, method: "CASH" } });
    expect(again.status).toBe("FINAL");
  });

  it("satışla başka müşteriden devralınan makine eski sahibine döner (geçmişe yazılır)", async () => {
    const { machineProduct, unit } = await stockMachine();
    const veli = (await createCustomer(ctx, { name: "Veli", village: "K", no_phone_flag: true })).id;
    const existing = await createMachine(ctx, {
      customer_id: veli, type: "Testere", brand: "Stihl", model: "MS 1", serial_number: "SN-1", is_temporary: false,
    });
    const sale = await createSale(ctx, { customerId: ali, lines: [line(machineProduct, 1, 600000, { serialUnitId: unit.id })] }, {
      finalize: true, payment: { amountKurus: 600000, method: "CASH" },
    });
    expect((await db.machines.get(existing.id))?.customer_id).toBe(ali);

    await cancelFinalSale(ctx, sale.id, "Hatalı satış");
    const machine = await db.machines.get(existing.id);
    expect(machine?.customer_id).toBe(veli);
    expect(machine?.sale_id).toBeUndefined();
    expect(machine?.archived_at).toBeUndefined();
    const history = await db.machine_ownership_history.where("machine_id").equals(existing.id).toArray();
    expect(history).toHaveLength(2);
  });
});
