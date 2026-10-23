import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getSupplierBalance } from "@/lib/finance/service";
import { createProduct } from "@/lib/products/service";
import type { ProductFields } from "@/lib/products/schema";
import { createPurchase, getPurchaseBalance, getPurchaseItems } from "@/lib/purchases/service";
import { createSale, getSaleItems, type SaleContext } from "@/lib/sales/service";
import { getInStockUnits } from "@/lib/serial/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { createSupplier } from "@/lib/suppliers/service";
import { createCustomer } from "@/lib/customers/service";
import { ReturnRuleError, reverseReturn } from "./service";
import { createPurchaseReturn, getReturnablePurchaseQuantity } from "./purchase";

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
let supplier: string;
const avail = async (id: string) => (await getProductBalance(id)).available;

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  buji = (await createProduct(ctx, { ...base, name: "NGK Buji" })).id;
  supplier = (await createSupplier(ctx, { name: "Orman Makine" })).id;
});

describe("tedarikçiye iade (AC-013)", () => {
  it("kısmi iade: stok çıkar, tedarikçi borcu düşer; ödenmemiş alımda para geri gelmez", async () => {
    const p = await createPurchase(ctx, { supplierId: supplier, lines: [line(buji, 10, 5000)] }, { receive: true });
    expect((await getSupplierBalance(ctx.businessId, supplier)).balance).toBe(50000);
    const [item] = await getPurchaseItems(p.id);

    const ret = await createPurchaseReturn(ctx, {
      purchaseId: p.id, reason: "Hatalı parti", refundMethod: "CASH",
      lines: [{ purchaseItemId: item.id, quantity: 4, bucket: "AVAILABLE" }],
    });
    expect(ret).toMatchObject({ original_type: "PURCHASE", total_amount: 200, status: "POSTED" });
    expect(ret.refund_payment_id).toBeUndefined();
    expect(await avail(buji)).toBe(6);
    expect((await getSupplierBalance(ctx.businessId, supplier)).balance).toBe(30000);
    expect(await getPurchaseBalance(p.id)).toMatchObject({ total: 30000, remaining: 30000, returned: 20000 });
    expect(await getReturnablePurchaseQuantity(item)).toBe(6);
  });

  it("ödenmiş alımda fazla ödenen kısım tedarikçiden geri alınır (IN); SUPPLIER_CREDIT'te alınmaz", async () => {
    const p = await createPurchase(ctx, { supplierId: supplier, lines: [line(buji, 10, 5000)] }, {
      receive: true, payment: { amountKurus: 50000, method: "CASH" },
    });
    const [item] = await getPurchaseItems(p.id);
    const ret = await createPurchaseReturn(ctx, {
      purchaseId: p.id, reason: "x", refundMethod: "BANK_TRANSFER",
      lines: [{ purchaseItemId: item.id, quantity: 2, bucket: "AVAILABLE" }],
    });
    const refund = await db.payments.get(ret.refund_payment_id!);
    expect(refund).toMatchObject({ direction: "IN", amount: 100, supplier_id: supplier, source_id: p.id });
    expect((await getSupplierBalance(ctx.businessId, supplier)).balance).toBe(0);

    const ret2 = await createPurchaseReturn(ctx, {
      purchaseId: p.id, reason: "y", refundMethod: "SUPPLIER_CREDIT",
      lines: [{ purchaseItemId: item.id, quantity: 2, bucket: "AVAILABLE" }],
    });
    expect(ret2.refund_payment_id).toBeUndefined();
    expect((await getSupplierBalance(ctx.businessId, supplier)).balance).toBe(-10000); // tedarikçi bize borçlu
  });

  it("elde yeterli stok yoksa reddedilir; fazla miktar ve çift seçim reddedilir; hasarlı kovadan çıkabilir", async () => {
    const p = await createPurchase(ctx, { supplierId: supplier, lines: [line(buji, 5, 1000)] }, { receive: true });
    const [item] = await getPurchaseItems(p.id);
    // 3 adet sat, 2 adet kaldı
    await createSale(ctx, { lines: [line(buji, 3, 2000)] }, { finalize: true, payment: { amountKurus: 6000, method: "CASH" } });
    await expect(
      createPurchaseReturn(ctx, { purchaseId: p.id, reason: "x", refundMethod: "CASH", lines: [{ purchaseItemId: item.id, quantity: 4, bucket: "AVAILABLE" }] })
    ).rejects.toThrow();
    await expect(
      createPurchaseReturn(ctx, { purchaseId: p.id, reason: "x", refundMethod: "CASH", lines: [{ purchaseItemId: item.id, quantity: 6, bucket: "AVAILABLE" }] })
    ).rejects.toThrow(/en fazla 5/);
    await expect(
      createPurchaseReturn(ctx, { purchaseId: p.id, reason: "x", refundMethod: "CASH", lines: [{ purchaseItemId: item.id, quantity: 1, bucket: "DAMAGED" }] })
    ).rejects.toThrow(); // hasarlı stokta bir şey yok
    expect(await avail(buji)).toBe(2);
    await createPurchaseReturn(ctx, { purchaseId: p.id, reason: "x", refundMethod: "CASH", lines: [{ purchaseItemId: item.id, quantity: 2, bucket: "AVAILABLE" }] });
    expect(await avail(buji)).toBe(0);
  });

  it("taslak alım için iade yapılamaz", async () => {
    const draft = await createPurchase(ctx, { supplierId: supplier, lines: [line(buji, 1, 1000)] }, { receive: false });
    const [dItem] = await getPurchaseItems(draft.id);
    const l = [{ purchaseItemId: dItem.id, quantity: 1, bucket: "AVAILABLE" as const }];
    await expect(createPurchaseReturn(ctx, { purchaseId: draft.id, reason: "x", refundMethod: "CASH", lines: l })).rejects.toBeInstanceOf(ReturnRuleError);
  });

  it("iadeyi geri alma: stok geri girer, tedarikçi geri ödemesi ters kaydolur", async () => {
    const p = await createPurchase(ctx, { supplierId: supplier, lines: [line(buji, 10, 5000)] }, {
      receive: true, payment: { amountKurus: 50000, method: "CASH" },
    });
    const [item] = await getPurchaseItems(p.id);
    const ret = await createPurchaseReturn(ctx, {
      purchaseId: p.id, reason: "x", refundMethod: "CASH",
      lines: [{ purchaseItemId: item.id, quantity: 10, bucket: "AVAILABLE" }],
    });
    expect(await avail(buji)).toBe(0);
    await reverseReturn(ctx, ret.id, "Yanlış girildi");
    expect(await avail(buji)).toBe(10);
    expect((await getSupplierBalance(ctx.businessId, supplier)).balance).toBe(0);
    expect((await db.return_transactions.get(ret.id))?.status).toBe("REVERSED");
    expect(await getReturnablePurchaseQuantity(item)).toBe(10);
  });
});

describe("seri takipli ürünün tedarikçiye iadesi", () => {
  it("seçilen birim RETURNED_TO_SUPPLIER olur; satılmış birim iade edilemez", async () => {
    const machine = (
      await createProduct(ctx, { ...base, name: "Testere", brand: "Stihl", model: "MS 1", is_serial_tracked: true })
    ).id;
    const p = await createPurchase(ctx, { supplierId: supplier, lines: [line(machine, 2, 400000, { serialNumbers: ["A-1", "A-2"] })] }, { receive: true });
    const [item] = await getPurchaseItems(p.id);
    const units = await getInStockUnits(machine);
    expect(units).toHaveLength(2);

    // Birini sat
    const ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
    await createSale(ctx, { customerId: ali, lines: [line(machine, 1, 600000, { serialUnitId: units[0].id })] }, {
      finalize: true, payment: { amountKurus: 600000, method: "CASH" },
    });
    expect(await getSaleItems((await db.sales.toArray())[0].id)).toHaveLength(1);

    await expect(
      createPurchaseReturn(ctx, { purchaseId: p.id, reason: "x", refundMethod: "CASH", lines: [{ purchaseItemId: item.id, bucket: "AVAILABLE", serialUnitIds: [units[0].id] }] })
    ).rejects.toThrow(/stokta değil/);

    const ret = await createPurchaseReturn(ctx, {
      purchaseId: p.id, reason: "Arızalı", refundMethod: "SUPPLIER_CREDIT",
      lines: [{ purchaseItemId: item.id, bucket: "AVAILABLE", serialUnitIds: [units[1].id] }],
    });
    expect(ret.total_amount).toBe(4000);
    expect((await db.product_serial_units.get(units[1].id))?.status).toBe("RETURNED_TO_SUPPLIER");
    expect(await avail(machine)).toBe(0);
    await expect(reverseReturn(ctx, ret.id, "x")).rejects.toThrow(/geri alınamaz/);
  });
});
