import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { getCustomerBalance } from "@/lib/finance/service";
import { createProduct } from "@/lib/products/service";
import type { ProductFields } from "@/lib/products/schema";
import { createPurchase } from "@/lib/purchases/service";
import { cancelFinalSale, createSale, getSaleBalance, getSaleItems, type SaleContext } from "@/lib/sales/service";
import { getInStockUnits } from "@/lib/serial/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { addStock } from "@/lib/stock/service";
import { createSupplier } from "@/lib/suppliers/service";
import {
  ReturnRuleError,
  createSaleReturn,
  getReturnableQuantity,
  reverseSaleReturn,
} from "./service";

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

const avail = async (id: string) => (await getProductBalance(id)).available;

describe("müşteri iadesi — tutar, stok ve para (AC-012, FR-018)", () => {
  it("tam ödenmiş satışın kısmi iadesi: stok geri döner, nakit iade ödemesi yazılır, bakiye sıfır kalır", async () => {
    const sale = await createSale(ctx, { customerId: ali, lines: [line(buji, 4, 10000)] }, {
      finalize: true, payment: { amountKurus: 40000, method: "CASH" },
    });
    const [item] = await getSaleItems(sale.id);

    const ret = await createSaleReturn(ctx, {
      saleId: sale.id, reason: "Uymadı", refundMethod: "CASH",
      lines: [{ saleItemId: item.id, quantity: 1, disposition: "SELLABLE" }],
    });
    expect(ret).toMatchObject({ status: "POSTED", total_amount: 100, refund_method: "CASH" });
    expect(ret.document_no).toMatch(/^IAD-DEMO-AB23-\d{4}-00001$/);
    expect(ret.refund_payment_id).toBeTruthy();
    expect(await avail(buji)).toBe(7);
    expect(await getReturnableQuantity(item)).toBe(3);

    const refund = await db.payments.get(ret.refund_payment_id!);
    expect(refund).toMatchObject({ direction: "OUT", amount: 100, source_id: sale.id });
    expect(await getSaleBalance(sale.id)).toMatchObject({ total: 30000, paid: 30000, remaining: 0, returned: 10000 });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);
  });

  it("veresiye satışın iadesi nakit çıkarmaz, borcu düşürür; müşteri alacağı seçilirse fazla ödeme alacak kalır", async () => {
    const sale = await createSale(ctx, { customerId: ali, lines: [line(buji, 4, 10000)] }, {
      finalize: true, payment: { amountKurus: 10000, method: "CASH" },
    });
    const [item] = await getSaleItems(sale.id);
    // borç 300; 2 adet (200) iade → yeni toplam 200, ödenen 100 → borç 100, nakit iade yok
    const r1 = await createSaleReturn(ctx, {
      saleId: sale.id, reason: "x", refundMethod: "CASH",
      lines: [{ saleItemId: item.id, quantity: 2, disposition: "SELLABLE" }],
    });
    expect(r1.refund_payment_id).toBeUndefined();
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(10000);

    // kalan 2 adedi de iade et, müşteri alacağı seç → toplam 400 iade, ödenen 100 → 100 alacak
    const r2 = await createSaleReturn(ctx, {
      saleId: sale.id, reason: "y", refundMethod: "CUSTOMER_CREDIT",
      lines: [{ saleItemId: item.id, quantity: 2, disposition: "SELLABLE" }],
    });
    expect(r2.refund_payment_id).toBeUndefined();
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(-10000);
    expect(await avail(buji)).toBe(10);
  });

  it("hasarlı iade hasarlı kovaya girer; NOT_RETURNED stoğa dokunmaz", async () => {
    const sale = await createSale(ctx, { customerId: ali, lines: [line(buji, 3, 10000)] }, {
      finalize: true, payment: { amountKurus: 30000, method: "CASH" },
    });
    const [item] = await getSaleItems(sale.id);
    await createSaleReturn(ctx, {
      saleId: sale.id, reason: "kırık", refundMethod: "CARD",
      lines: [{ saleItemId: item.id, quantity: 1, disposition: "DAMAGED" }],
    });
    expect(await getProductBalance(buji)).toMatchObject({ available: 7, damaged: 1 });
    await createSaleReturn(ctx, {
      saleId: sale.id, reason: "ürün gelmedi", refundMethod: "CASH",
      lines: [{ saleItemId: item.id, quantity: 1, disposition: "NOT_RETURNED" }],
    });
    expect(await getProductBalance(buji)).toMatchObject({ available: 7, damaged: 1 });
  });

  it("iade edilen miktar toplamı satılanı aşamaz; neden zorunlu; müşterisiz satışta müşteri alacağı olmaz", async () => {
    const sale = await createSale(ctx, { lines: [line(buji, 2, 10000)] }, {
      finalize: true, payment: { amountKurus: 20000, method: "CASH" },
    });
    const [item] = await getSaleItems(sale.id);
    const l = (q: number) => [{ saleItemId: item.id, quantity: q, disposition: "SELLABLE" as const }];
    await expect(createSaleReturn(ctx, { saleId: sale.id, reason: " ", refundMethod: "CASH", lines: l(1) })).rejects.toThrow(/neden/i);
    await expect(createSaleReturn(ctx, { saleId: sale.id, reason: "x", refundMethod: "CUSTOMER_CREDIT", lines: l(1) })).rejects.toBeInstanceOf(ReturnRuleError);
    await createSaleReturn(ctx, { saleId: sale.id, reason: "x", refundMethod: "CASH", lines: l(2) });
    await expect(createSaleReturn(ctx, { saleId: sale.id, reason: "x", refundMethod: "CASH", lines: l(1) })).rejects.toThrow(/en fazla 0/);
    expect(await avail(buji)).toBe(10);
  });

  it("ondalıklı kalemin son parçası kuruş farkı bırakmaz", async () => {
    const misina = (await createProduct(ctx, { ...base, name: "Misina", unit: "METRE" })).id;
    await addStock(ctx, { productId: misina, quantity: 30 });
    const sale = await createSale(ctx, { lines: [line(misina, 3, 3333)] }, { finalize: true, payment: { amountKurus: 9999, method: "CASH" } });
    const [item] = await getSaleItems(sale.id);
    const a = await createSaleReturn(ctx, { saleId: sale.id, reason: "x", refundMethod: "CASH", lines: [{ saleItemId: item.id, quantity: 1, disposition: "SELLABLE" }] });
    const b = await createSaleReturn(ctx, { saleId: sale.id, reason: "x", refundMethod: "CASH", lines: [{ saleItemId: item.id, quantity: 2, disposition: "SELLABLE" }] });
    expect(Math.round((a.total_amount + b.total_amount) * 100)).toBe(9999);
    expect((await getSaleBalance(sale.id)).remaining).toBe(0);
  });

  it("iadeyi geri alma: stok çıkar, iade ödemesi ters kaydolur, iade REVERSED kalır ve tekrar iade edilebilir", async () => {
    const sale = await createSale(ctx, { customerId: ali, lines: [line(buji, 2, 10000)] }, {
      finalize: true, payment: { amountKurus: 20000, method: "CASH" },
    });
    const [item] = await getSaleItems(sale.id);
    const ret = await createSaleReturn(ctx, {
      saleId: sale.id, reason: "x", refundMethod: "CASH",
      lines: [{ saleItemId: item.id, quantity: 2, disposition: "SELLABLE" }],
    });
    expect(await avail(buji)).toBe(10);

    await expect(reverseSaleReturn(ctx, ret.id, " ")).rejects.toThrow(/neden/i);
    const reversed = await reverseSaleReturn(ctx, ret.id, "Yanlış girildi");
    expect(reversed.status).toBe("REVERSED");
    expect(await db.return_transactions.get(ret.id)).toBeTruthy();
    expect(await avail(buji)).toBe(8);
    expect(await getSaleBalance(sale.id)).toMatchObject({ total: 20000, paid: 20000, remaining: 0 });
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);
    await expect(reverseSaleReturn(ctx, ret.id, "tekrar")).rejects.toBeInstanceOf(ReturnRuleError);
    expect(await getReturnableQuantity(item)).toBe(2);
  });

  it("iadesi olan satış iptal edilemez; iade geri alınınca iptal edilebilir", async () => {
    const sale = await createSale(ctx, { customerId: ali, lines: [line(buji, 2, 10000)] }, {
      finalize: true, payment: { amountKurus: 20000, method: "CASH" },
    });
    const [item] = await getSaleItems(sale.id);
    const ret = await createSaleReturn(ctx, {
      saleId: sale.id, reason: "x", refundMethod: "CASH",
      lines: [{ saleItemId: item.id, quantity: 1, disposition: "SELLABLE" }],
    });
    await expect(cancelFinalSale(ctx, sale.id, "iptal")).rejects.toThrow(/iade/i);
    await reverseSaleReturn(ctx, ret.id, "vazgeçildi");
    await cancelFinalSale(ctx, sale.id, "iptal");
    expect(await avail(buji)).toBe(10);
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);
  });
});

describe("makine iadesi", () => {
  it("seri birim stoğa döner, makine kaydı geri alınır; iadesi geri alınamaz", async () => {
    const machineProduct = (
      await createProduct(ctx, { ...base, name: "Testere", brand: "Stihl", model: "MS 1", category: "Testere", is_serial_tracked: true })
    ).id;
    const supplier = (await createSupplier(ctx, { name: "T" })).id;
    await createPurchase(ctx, { supplierId: supplier, lines: [line(machineProduct, 1, 400000, { serialNumbers: ["SN-1"] })] }, { receive: true });
    const [unit] = await getInStockUnits(machineProduct);
    const sale = await createSale(ctx, { customerId: ali, lines: [line(machineProduct, 1, 600000, { serialUnitId: unit.id })] }, {
      finalize: true, payment: { amountKurus: 600000, method: "CASH" },
    });
    const [item] = await getSaleItems(sale.id);
    await expect(
      createSaleReturn(ctx, { saleId: sale.id, reason: "x", refundMethod: "CASH", lines: [{ saleItemId: item.id, quantity: 2, disposition: "SELLABLE" }] })
    ).rejects.toBeInstanceOf(ReturnRuleError);

    const ret = await createSaleReturn(ctx, {
      saleId: sale.id, reason: "Müşteri vazgeçti", refundMethod: "BANK_TRANSFER",
      lines: [{ saleItemId: item.id, quantity: 1, disposition: "SELLABLE" }],
    });
    expect((await db.product_serial_units.get(unit.id))?.status).toBe("IN_STOCK");
    expect(await avail(machineProduct)).toBe(1);
    expect(ret.refund_payment_id).toBeTruthy();
    expect((await getCustomerBalance(ctx.businessId, ali)).balance).toBe(0);
    await expect(reverseSaleReturn(ctx, ret.id, "x")).rejects.toThrow(/geri alınamaz/);
  });
});
