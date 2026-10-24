import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { getSupplierBalance, recordSupplierPayment, setSupplierOpeningBalance } from "@/lib/finance/service";
import { createProduct } from "@/lib/products/service";
import { createPurchase, getPurchaseItems } from "@/lib/purchases/service";
import { recordCustomerCollection, getCustomerOpenItems } from "@/lib/finance/openItems";
import { syncPaymentDueNotifications } from "@/lib/notifications/paymentDue";
import { createMachine } from "@/lib/machines/service";
import { addOperation, addPart, recordApproval, setPartUsedQuantity } from "@/lib/services/quote";
import { changeServiceStatus, deliverService, getServiceBalance, openService } from "@/lib/services/service";
import { createServiceReturn, refundCancelledServicePayment } from "@/lib/returns/service-return";
import { createPurchaseReturn } from "@/lib/returns/purchase";
import { createSaleReturn, reverseSaleReturn } from "@/lib/returns/service";
import { cancelFinalSale, createSale, getSaleBalance, getSaleItems } from "@/lib/sales/service";
import { getInStockUnits } from "@/lib/serial/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { addStock } from "@/lib/stock/service";
import { createSupplier } from "@/lib/suppliers/service";
import { applyPushItem } from "@/lib/sync/apply";
import { getPendingItems, markConflict, markError, markSynced } from "@/lib/sync/queue";
import { isSyncTableName } from "@/lib/sync/tables";

/**
 * Sunucuya karşı uçtan uca doğrulama.
 *
 * Uygulamanın iş kodunu yerel (taklit) veritabanında çalıştırır, kuyruğa yazılanı
 * `/api/sync/push` ile AYNI fonksiyonla (applyPushItem) gerçek Supabase'e gönderir
 * ve sunucudaki kayıtları okuyarak doğrular: RLS, kısıtlar, yabancı anahtar sırası,
 * sunucu tetikleyicileri (stok özeti, sürüm). Tarayıcı kullanılmaz.
 *
 * Oluşturulan kayıtların adları "E2E" ile başlar; her çalıştırma yeni bir cihaz
 * koduyla yapılır, belge numaraları çakışmaz.
 */

function loadEnvFile() {
  const file = path.resolve(import.meta.dirname, "..", ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvFile();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

const RUN = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, "X").padEnd(4, "X");
const DEVICE = `DEMO-${RUN}`;
const TAG = `E2E-${RUN}`;

let supabase: SupabaseClient;
let ctx: { businessId: string; deviceCode: string; actorId?: string };
let hasSerial = false;
let hasReturns = false;
let hasDue = false;

const created: string[] = [];

/** Kuyruktaki her şeyi sunucuya gönderir (route'un yaptığıyla aynı mantık). */
async function sync(label: string) {
  const errors: string[] = [];
  let pushed = 0;
  let conflicts = 0;
  const items = await getPendingItems();
  for (const item of items) {
    const result = await applyPushItem(
      { supabase: supabase as never, businessId: ctx.businessId },
      {
        id: item.id,
        table_name: item.table_name as never,
        record_id: item.record_id,
        operation: item.operation,
        payload: item.payload,
      }
    );
    if (result.success) {
      await markSynced(item.id);
      pushed++;
    } else if (result.conflict) {
      await markConflict(item.id, result.error);
      conflicts++;
      errors.push(`ÇAKIŞMA ${item.table_name}/${item.operation}: ${result.error}`);
    } else {
      await markError(item.id, result.error ?? "hata");
      errors.push(`${item.table_name}/${item.operation}: ${result.error}`);
    }
  }
  if (errors.length > 0) throw new Error(`[${label}] sunucu reddetti (${errors.length}/${items.length}):\n${errors.join("\n")}`);
  await pullAll(); // uygulama da gönderdikten sonra çeker: yerel sürümler sunucununkine yetişir
  return { pushed, conflicts };
}

/** Sunucudaki kayıtları (başka bir cihaz gibi) yerel veritabanına çeker. */
let pullCursor = 0;
async function pullAll() {
  let cursor = pullCursor;
  let applied = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("sync_changes")
      .select("id, table_name, record_id, operation, record")
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) throw new Error(`pull: ${error.message}`);
    if (!data?.length) break;
    for (const change of data) {
      if (!isSyncTableName(change.table_name)) continue;
      const table = db.table(change.table_name);
      if (change.operation === "DELETE") await table.delete(change.record_id);
      else if (change.record) await table.put(change.record);
      applied++;
    }
    cursor = data[data.length - 1].id as number;
  }
  pullCursor = cursor;
  return applied;
}

async function one<T = Record<string, unknown>>(table: string, id: string): Promise<T> {
  const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  if (!data) throw new Error(`${table}/${id} sunucuda bulunamadı`);
  return data as T;
}

const near = (a: unknown, b: number) => expect(Number(a)).toBeCloseTo(b, 4);

describe.skipIf(!URL || !ANON || !EMAIL || !PASSWORD)("sunucuya karşı uçtan uca", () => {
  let supplierId: string;
  let customerId: string;
  let bujiId: string;
  let machineProductId: string;
  let creditSaleId: string;

  beforeAll(async () => {
    supabase = createClient(URL as string, ANON as string, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL as string, password: PASSWORD as string });
    if (error || !data.user) throw new Error(`Giriş yapılamadı: ${error?.message}`);

    const { data: profile } = await supabase.from("users").select("business_id").eq("id", data.user.id).single();
    ctx = { businessId: profile?.business_id as string, deviceCode: DEVICE, actorId: data.user.id };

    // Önceki çalıştırmaların kayıtlarını çekmemek için imleç, mevcut son değişikliğe konur.
    const { data: last } = await supabase.from("sync_changes").select("id").order("id", { ascending: false }).limit(1);
    pullCursor = (last?.[0]?.id as number | undefined) ?? 0;

    hasDue = !(await supabase.from("sales").select("due_date").limit(1)).error;
    const probe = await supabase.from("product_serial_units").select("internal_number").limit(1);
    hasSerial = !probe.error;
    hasReturns = !(await supabase.from("return_transactions").select("refund_payment_id").limit(1)).error;
  });

  it("0) bağlantı: oturum, işletme ve migration durumu", () => {
    expect(ctx.businessId).toMatch(/^[0-9a-f-]{36}$/);
    console.log(`[e2e] cihaz=${DEVICE} · 018 (seri birim): ${hasSerial ? "VAR" : "YOK"} · 019 (iade): ${hasReturns ? "VAR" : "YOK"} · 020 (vade): ${hasDue ? "VAR" : "YOK"}`);
  });

  it("1) tedarikçi: açılış bakiyesi ve ödeme sunucuya gider, bakiye sunucu verisinden doğru çıkar", async () => {
    const s = await createSupplier(ctx, { name: `${TAG} Tedarikçi` });
    supplierId = s.id;
    await setSupplierOpeningBalance(ctx, { supplierId, direction: "OWED_TO_PARTY", amountKurus: 500000, asOfDate: "2026-10-01", note: "e2e" });
    await recordSupplierPayment(ctx, { supplierId, direction: "OUT", method: "BANK_TRANSFER", amountKurus: 200000 });
    await sync("tedarikçi");

    expect((await one<{ name: string }>("suppliers", supplierId)).name).toBe(`${TAG} Tedarikçi`);
    const { data: pay } = await supabase.from("payments").select("direction,amount,supplier_id").eq("supplier_id", supplierId);
    expect(pay).toHaveLength(1);
    near(pay?.[0].amount, 2000);
    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe(300000);
    created.push("tedarikçi");
  });

  it("2) müşteri ve seri takipsiz ürün: açılış stoğu sunucu tetikleyicisiyle ürün özetine yansır", async () => {
    customerId = (await createCustomer(ctx, { name: `${TAG} Müşteri`, village: "Test Köyü", no_phone_flag: true })).id;
    const p = await createProduct(ctx, {
      name: `${TAG} Buji`, unit: "ADET", is_serial_tracked: false, default_sale_price: 100,
      default_tax_mode: "NONE", default_tax_rate: 0,
    });
    bujiId = p.id;
    await addStock(ctx, { productId: bujiId, quantity: 10, unitCost: 40, note: "e2e açılış" });
    await sync("müşteri+ürün");

    expect((await one<{ name: string }>("customers", customerId)).name).toContain(TAG);
    const server = await one<{ stock_available: number }>("products", bujiId);
    near(server.stock_available, 10); // 009'daki sunucu tetikleyicisi
    created.push("müşteri", "ürün");
  });

  it("3) satın alma: teslim alma stok, son alış fiyatı ve tedarikçi borcunu sunucuda da doğru yapar", async () => {
    const purchase = await createPurchase(
      ctx,
      { supplierId, supplierRef: "E2E-IRS-1", lines: [{ productId: bujiId, quantity: 5, unitPriceKurus: 5000, taxMode: "NONE", taxRate: 0 }] },
      { receive: true, payment: { amountKurus: 10000, method: "CASH" } }
    );
    await sync("alım");

    const row = await one<{ status: string; total_amount: number; supplier_ref: string; received_at: string | null }>("purchases", purchase.id);
    expect(row.status).toBe("RECEIVED");
    expect(row.supplier_ref).toBe("E2E-IRS-1");
    expect(row.received_at).toBeTruthy();
    near(row.total_amount, 250);

    const { data: items } = await supabase.from("purchase_items").select("quantity,line_total,stock_movement_id").eq("purchase_id", purchase.id);
    expect(items).toHaveLength(1);
    expect(items?.[0].stock_movement_id).toBeTruthy();

    const product = await one<{ stock_available: number; last_purchase_price: number }>("products", bujiId);
    near(product.stock_available, 15);
    near(product.last_purchase_price, 50);

    // Sunucudaki satırlardan bağımsız hesap: açılış 5000 + alım 250 − ödemeler (2000 + 100) = 3150
    const { data: payments } = await supabase.from("payments").select("direction,amount").eq("supplier_id", supplierId);
    const paid = (payments ?? []).reduce((a, p) => a + (p.direction === "OUT" ? 1 : -1) * Number(p.amount), 0);
    near(5000 + 250 - paid, 3150);
    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe(315000);
  });

  it("4) veresiye satış: stok düşer, tahsilat ve kalan alacak sunucuda doğru", async () => {
    const sale = await createSale(
      ctx,
      { customerId, lines: [{ productId: bujiId, quantity: 2, unitPriceKurus: 10000, taxMode: "NONE", taxRate: 0 }] },
      { finalize: true, payment: { amountKurus: 5000, method: "CASH" } }
    );
    await sync("veresiye satış");
    creditSaleId = sale.id;

    const row = await one<{ status: string; total_amount: number; finalized_at: string | null; customer_id: string }>("sales", sale.id);
    expect(row).toMatchObject({ status: "FINAL", customer_id: customerId });
    near(row.total_amount, 200);

    const { data: pays } = await supabase.from("payments").select("amount,customer_id,source_type").eq("source_id", sale.id);
    expect(pays).toHaveLength(1);
    expect(pays?.[0]).toMatchObject({ customer_id: customerId, source_type: "SALE" });

    near((await one<{ stock_available: number }>("products", bujiId)).stock_available, 13);
    expect(await getSaleBalance(sale.id)).toMatchObject({ total: 20000, paid: 5000, remaining: 15000 });
    created.push("alım", "veresiye satış");
  });

  it("5) müşterisiz peşin satış: ödeme müşterisiz belgeye bağlı olarak sunucuya girer", async () => {
    const sale = await createSale(
      ctx,
      { lines: [{ productId: bujiId, quantity: 1, unitPriceKurus: 10000, taxMode: "NONE", taxRate: 0 }] },
      { finalize: true, payment: { amountKurus: 10000, method: "CARD" } }
    );
    await sync("peşin satış");

    const { data: pays } = await supabase.from("payments").select("amount,customer_id,supplier_id").eq("source_id", sale.id);
    expect(pays).toHaveLength(1);
    expect(pays?.[0].customer_id).toBeNull();
    near((await one<{ stock_available: number }>("products", bujiId)).stock_available, 12);
  });

  it("6) sunucu kuralı: aynı ekleme yeniden gönderilince kopya oluşmaz (idempotent), eski sürümle güncelleme çakışma verir", async () => {
    const pending = await db.sales.get(creditSaleId);
    expect(pending).toBeTruthy();

    // Aynı satış kaydını tekrar INSERT et: kopya oluşmamalı
    const before = (await supabase.from("sales").select("id", { count: "exact", head: true }).eq("id", pending!.id)).count;
    const again = await applyPushItem(
      { supabase: supabase as never, businessId: ctx.businessId },
      { id: "x", table_name: "sales", record_id: pending!.id, operation: "INSERT", payload: { id: pending!.id, business_id: ctx.businessId, document_no: pending!.document_no, status: "DRAFT", total_amount: 1, created_by_device: "x", created_at: new Date().toISOString() } }
    );
    expect(again.success).toBe(true);
    const after = (await supabase.from("sales").select("id", { count: "exact", head: true }).eq("id", pending!.id)).count;
    expect(after).toBe(before);
    // ve mevcut kaydı ezmedi
    expect((await one<{ status: string }>("sales", pending!.id)).status).toBe("FINAL");

    // Eski sürümle güncelleme → çakışma
    const stale = await applyPushItem(
      { supabase: supabase as never, businessId: ctx.businessId },
      { id: "y", table_name: "sales", record_id: pending!.id, operation: "UPDATE", payload: { id: pending!.id, business_id: ctx.businessId, notes: "eski sürüm", version: 0 } }
    );
    expect(stale.success).toBe(false);
    expect(stale.conflict).toBe(true);
  });

  it("7) makine satışı: seri birimler, makine kaydı ve çift satış engeli", async (ctxTest) => {
    if (!hasSerial) {
      console.log("[e2e] migration 018 uygulanmamış: makine bölümü atlandı");
      return ctxTest.skip();
    }

    machineProductId = (
      await createProduct(ctx, {
        name: `${TAG} Testere`, brand: "Stihl", model: "MS E2E", category: "Zincirli testere", unit: "ADET",
        is_serial_tracked: true, default_sale_price: 6000, default_tax_mode: "NONE", default_tax_rate: 0,
      })
    ).id;
    const sn1 = `${TAG}-A`;
    const sn2 = `${TAG}-B`;
    const purchase = await createPurchase(
      ctx,
      { supplierId, lines: [{ productId: machineProductId, quantity: 2, unitPriceKurus: 400000, taxMode: "NONE", taxRate: 0, serialNumbers: [sn1, sn2] }] },
      { receive: true }
    );
    await sync("makine alımı");

    const { data: units } = await supabase
      .from("product_serial_units")
      .select("id,serial_number,internal_number,status,purchase_item_id")
      .eq("product_id", machineProductId);
    expect(units).toHaveLength(2);
    expect(units?.every((u) => u.status === "IN_STOCK" && !!u.internal_number && !!u.purchase_item_id)).toBe(true);
    expect(units?.map((u) => u.serial_number).sort()).toEqual([sn1, sn2].sort());
    near((await one<{ stock_available: number }>("products", machineProductId)).stock_available, 2);
    expect((await one<{ status: string }>("purchases", purchase.id)).status).toBe("RECEIVED");

    // Makine satışı
    const unit = (await getInStockUnits(machineProductId)).find((u) => u.serial_number === sn1)!;
    const line = { productId: machineProductId, quantity: 1, unitPriceKurus: 600000, taxMode: "NONE" as const, taxRate: 0, serialUnitId: unit.id };
    const sale = await createSale(ctx, { customerId, lines: [line] }, { finalize: true, payment: { amountKurus: 600000, method: "CASH" } });
    await sync("makine satışı");

    const soldUnit = await one<{ status: string; machine_id: string; sale_item_id: string }>("product_serial_units", unit.id);
    expect(soldUnit.status).toBe("SOLD");
    const machine = await one<{ customer_id: string; serial_number: string; sale_id: string; sale_price: number; internal_number: string; brand: string }>("machines", soldUnit.machine_id);
    expect(machine).toMatchObject({ customer_id: customerId, serial_number: sn1, sale_id: sale.id, brand: "Stihl" });
    near(machine.sale_price, 6000);
    expect(machine.internal_number).toMatch(/^MK-/);
    near((await one<{ stock_available: number }>("products", machineProductId)).stock_available, 1);

    // Aynı birimi tekrar satma denemesi (aynı cihaz): reddedilmeli, hiçbir şey yazılmamalı
    const salesBefore = await db.sales.count();
    await expect(createSale(ctx, { customerId, lines: [line] }, { finalize: true })).rejects.toThrow(/stokta değil/);
    expect(await db.sales.count()).toBe(salesBefore);

    // Başka cihaz eski sürümle aynı birimi satmaya kalkarsa: sunucu birim güncellemesini REDDETMELİ (AC-039)
    const raced = await applyPushItem(
      { supabase: supabase as never, businessId: ctx.businessId },
      {
        id: "race", table_name: "product_serial_units", record_id: unit.id, operation: "UPDATE",
        payload: { id: unit.id, business_id: ctx.businessId, status: "SOLD", version: 1 },
      }
    );
    expect(raced.success).toBe(false);
    expect(raced.conflict).toBe(true);
    created.push("makine alımı", "makine satışı");
  });

  it("7b) satış iptali: stok, birim, tahsilat ve makine sunucuda geri alınır", async (ctxTest) => {
    // Müşterili veresiye satış (4. adımdaki) yerine yeni bir satış: izlenmesi kolay
    const sale = await createSale(
      ctx,
      { customerId, lines: [{ productId: bujiId, quantity: 2, unitPriceKurus: 10000, taxMode: "NONE", taxRate: 0 }] },
      { finalize: true, payment: { amountKurus: 20000, method: "CASH" } }
    );
    await sync("iptal edilecek satış");
    near((await one<{ stock_available: number }>("products", bujiId)).stock_available, 10);

    await cancelFinalSale(ctx, sale.id, "e2e iptal");
    await sync("satış iptali");
    expect((await one<{ status: string; cancel_reason: string }>("sales", sale.id))).toMatchObject({ status: "CANCELLED", cancel_reason: "e2e iptal" });
    near((await one<{ stock_available: number }>("products", bujiId)).stock_available, 12);
    const { data: pays } = await supabase.from("payments").select("direction,status,reversal_of_id").eq("source_id", sale.id);
    expect(pays).toHaveLength(2);
    expect(pays?.some((p) => p.status === "REVERSED" && p.direction === "OUT" && p.reversal_of_id)).toBe(true);
    const { data: mv } = await supabase.from("stock_movements").select("reversal_of_id,movement_type").eq("source_id", sale.id).eq("movement_type", "CANCEL_REVERSAL");
    expect(mv).toHaveLength(1);
    expect(mv?.[0].reversal_of_id).toBeTruthy();

    if (!hasSerial) return ctxTest.skip();
    const unit = (await getInStockUnits(machineProductId))[0];
    const msale = await createSale(
      ctx,
      { customerId, lines: [{ productId: machineProductId, quantity: 1, unitPriceKurus: 600000, taxMode: "NONE", taxRate: 0, serialUnitId: unit.id }] },
      { finalize: true, payment: { amountKurus: 600000, method: "CASH" } }
    );
    await sync("ikinci makine satışı");
    await cancelFinalSale(ctx, msale.id, "e2e makine iptali");
    await sync("makine satışı iptali");
    const back = await one<{ status: string; machine_id: string | null }>("product_serial_units", unit.id);
    expect(back).toMatchObject({ status: "IN_STOCK", machine_id: null });
    near((await one<{ stock_available: number }>("products", machineProductId)).stock_available, 1);
  });

  it("7c) müşteri iadesi: iade belgesi, satırlar, stok, para iadesi ve geri alma sunucuda doğru", async (ctxTest) => {
    if (!hasReturns) {
      console.log("[e2e] migration 019 uygulanmamış: iade bölümü atlandı");
      return ctxTest.skip();
    }
    const sale = await createSale(
      ctx,
      { customerId, lines: [{ productId: bujiId, quantity: 4, unitPriceKurus: 10000, taxMode: "NONE", taxRate: 0 }] },
      { finalize: true, payment: { amountKurus: 40000, method: "CASH" } }
    );
    await sync("iade için satış");
    const [item] = await getSaleItems(sale.id);
    const before = Number((await one<{ stock_available: number }>("products", bujiId)).stock_available);

    const ret = await createSaleReturn(ctx, {
      saleId: sale.id, reason: "e2e iade", refundMethod: "CASH",
      lines: [{ saleItemId: item.id, quantity: 1, disposition: "SELLABLE" }],
    });
    await sync("iade");
    const row = await one<{ status: string; total_amount: number; document_no: string; refund_payment_id: string | null }>("return_transactions", ret.id);
    expect(row).toMatchObject({ status: "POSTED", refund_payment_id: ret.refund_payment_id });
    near(row.total_amount, 100);
    const { data: ritems } = await supabase.from("return_items").select("quantity,amount,stock_disposition,stock_movement_id,original_line_id").eq("return_id", ret.id);
    expect(ritems).toHaveLength(1);
    expect(ritems?.[0]).toMatchObject({ stock_disposition: "SELLABLE", original_line_id: item.id });
    near((await one<{ stock_available: number }>("products", bujiId)).stock_available, before + 1);
    const refund = await one<{ direction: string; amount: number }>("payments", ret.refund_payment_id as string);
    expect(refund.direction).toBe("OUT");
    near(refund.amount, 100);

    await reverseSaleReturn(ctx, ret.id, "e2e geri alma");
    await sync("iade geri alma");
    expect((await one<{ status: string }>("return_transactions", ret.id)).status).toBe("REVERSED");
    near((await one<{ stock_available: number }>("products", bujiId)).stock_available, before);
  });

  it("7d) tedarikçiye iade: stok çıkışı, iade belgesi ve tedarikçi bakiyesi sunucuda doğru", async (ctxTest) => {
    if (!hasReturns) return ctxTest.skip();
    const purchase = await createPurchase(
      ctx,
      { supplierId, lines: [{ productId: bujiId, quantity: 3, unitPriceKurus: 5000, taxMode: "NONE", taxRate: 0 }] },
      { receive: true }
    );
    await sync("iade için alım");
    const [item] = await getPurchaseItems(purchase.id);
    const stockBefore = Number((await one<{ stock_available: number }>("products", bujiId)).stock_available);
    const balanceBefore = (await getSupplierBalance(ctx.businessId, supplierId)).balance;

    const ret = await createPurchaseReturn(ctx, {
      purchaseId: purchase.id, reason: "e2e tedarikçi iadesi", refundMethod: "SUPPLIER_CREDIT",
      lines: [{ purchaseItemId: item.id, quantity: 2, bucket: "AVAILABLE" }],
    });
    await sync("tedarikçi iadesi");
    expect(await one<{ original_type: string; status: string }>("return_transactions", ret.id)).toMatchObject({ original_type: "PURCHASE", status: "POSTED" });
    near((await one<{ stock_available: number }>("products", bujiId)).stock_available, stockBefore - 2);
    const { data: mv } = await supabase.from("stock_movements").select("movement_type,quantity").eq("source_id", ret.id);
    expect(mv).toHaveLength(1);
    expect(mv?.[0]).toMatchObject({ movement_type: "RETURN_OUT" });
    near(mv?.[0].quantity, -2);
    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe(balanceBefore - 10000); // bakiye, yeni alımı zaten içeriyor; 2 adetlik iade 100 TL düşürür
  });

  it("7e) servis: kapora iadesi ve teslim sonrası parça iadesi sunucuda doğru", async (ctxTest) => {
    if (!hasReturns) return ctxTest.skip();
    const machineId = (await createMachine(ctx, { customer_id: customerId, type: "Testere", brand: "Stihl", model: "E2E", is_temporary: false })).id;

    // a) iptal edilen servis + kapora iadesi
    const cancelled = await openService(ctx, { customerId, machineId, complaint: "e2e", deposit: { amountKurus: 20000, method: "CASH" } });
    await changeServiceStatus(ctx, cancelled.id, "CANCELLED", "e2e vazgeçti");
    await refundCancelledServicePayment(ctx, cancelled.id, { amountKurus: 20000, method: "CASH" });
    await sync("iptal edilen servis");
    expect((await one<{ status: string }>("services", cancelled.id)).status).toBe("CANCELLED");
    const { data: pays } = await supabase.from("payments").select("direction,amount").eq("source_id", cancelled.id);
    expect(pays?.map((p) => p.direction).sort()).toEqual(["IN", "OUT"]);
    expect(await getServiceBalance(cancelled.id)).toMatchObject({ paid: 0, remaining: 0 });

    // b) teslim edilmiş servis + parça iadesi
    const service = await openService(ctx, { customerId, machineId, complaint: "e2e" });
    const op = await addOperation(ctx, service.id, { description: "Bakım", unitPriceKurus: 50000, taxMode: "NONE", taxRate: 0 });
    const part = await addPart(ctx, service.id, { sourceType: "STOCK_PRODUCT", productId: bujiId, quantity: 2 });
    await recordApproval(ctx, service.id, {
      decisions: [{ kind: "operation", id: op.id, decision: "APPROVED" }, { kind: "part", id: part.id, decision: "APPROVED" }],
      method: "IN_PERSON",
    });
    for (const to of ["DIAGNOSED", "IN_PROGRESS"] as const) await changeServiceStatus(ctx, service.id, to);
    await setPartUsedQuantity(ctx, part.id, 2);
    await changeServiceStatus(ctx, service.id, "COMPLETED");
    await deliverService(ctx, service.id, { payment: { amountKurus: 70000, method: "CASH" } });
    await sync("teslim edilen servis");
    const stockBefore = Number((await one<{ stock_available: number }>("products", bujiId)).stock_available);

    const ret = await createServiceReturn(ctx, {
      serviceId: service.id, reason: "e2e parça iadesi", refundMethod: "CASH",
      lines: [{ servicePartId: part.id, quantity: 1, disposition: "SELLABLE" }],
    });
    await sync("servis iadesi");
    expect(await one<{ original_type: string; status: string }>("return_transactions", ret.id)).toMatchObject({ original_type: "SERVICE", status: "POSTED" });
    near((await one<{ stock_available: number }>("products", bujiId)).stock_available, stockBefore + 1);
    expect(await getServiceBalance(service.id)).toMatchObject({ remaining: 0 });
  });

  it("7f) vadeli veresiye, genel tahsilat tahsisi ve vade bildirimi sunucuda doğru", async (ctxTest) => {
    if (!hasDue) {
      console.log("[e2e] migration 020 uygulanmamış: vade/tahsis bölümü atlandı");
      return ctxTest.skip();
    }
    const dueDate = "2026-01-10";
    const a = await createSale(ctx, { customerId, saleDate: "2026-01-01", dueDate, lines: [{ productId: bujiId, quantity: 1, unitPriceKurus: 20000, taxMode: "NONE", taxRate: 0 }] }, { finalize: true });
    const b = await createSale(ctx, { customerId, saleDate: "2026-01-05", lines: [{ productId: bujiId, quantity: 1, unitPriceKurus: 30000, taxMode: "NONE", taxRate: 0 }] }, { finalize: true });
    await sync("vadeli veresiye satışlar");
    expect((await one<{ due_date: string }>("sales", a.id)).due_date).toBe(dueDate);

    // Genel tahsilat: kullanıcı dağılımı elle verir (a'ya 200 TL, b'ye 50 TL)
    const open = await getCustomerOpenItems(ctx.businessId, customerId);
    expect(open.items.map((i) => i.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    const allocations = [
      { kind: "SALE" as const, id: a.id, amountKurus: 20000 },
      { kind: "SALE" as const, id: b.id, amountKurus: 5000 },
    ];
    const payment = await recordCustomerCollection(ctx, { customerId, method: "CASH", amountKurus: 25000, allocations });
    await sync("genel tahsilat");
    const { data: allocs } = await supabase.from("payment_allocations").select("source_id,allocated_amount").eq("payment_id", payment.id);
    expect(allocs).toHaveLength(2);
    expect(Object.fromEntries((allocs ?? []).map((x) => [x.source_id, Number(x.allocated_amount)]))).toEqual({ [a.id]: 200, [b.id]: 50 });
    expect(await getSaleBalance(a.id)).toMatchObject({ remaining: 0 });
    expect(await getSaleBalance(b.id)).toMatchObject({ remaining: 25000 });

    // Vade bildirimi: a ödendi (bildirim yok); b'ye vade verilmemiş → bildirim üretilmez
    expect(await syncPaymentDueNotifications(ctx, "2026-03-01")).toBe(0);
    const c = await createSale(ctx, { customerId, dueDate: "2026-02-01", lines: [{ productId: bujiId, quantity: 1, unitPriceKurus: 10000, taxMode: "NONE", taxRate: 0 }] }, { finalize: true });
    expect(await syncPaymentDueNotifications(ctx, "2026-03-01")).toBe(2); // vade günü + 7 gün gecikme
    await sync("vade bildirimleri");
    const { data: notes } = await supabase.from("notifications").select("dedupe_key,type").eq("related_record_id", c.id);
    expect(notes?.map((n) => n.dedupe_key).sort()).toEqual([`PAYMENT_DUE:SALE:${c.id}:DUE`, `PAYMENT_DUE:SALE:${c.id}:OVERDUE7`].sort());
    // Aynı olay ikinci cihazda aynı kimlikle üretilir: tekrar gönderim çakışma değil
    await db.notifications.clear();
    await db.sync_queue.clear();
    await syncPaymentDueNotifications({ ...ctx, deviceCode: "DEMO-ZZ99" }, "2026-03-01");
    await sync("ikinci cihaz bildirimleri");
  });

  it("8) başka bir cihaz gibi çekme: yerel veri silinip sunucudan alınınca stok ve bakiyeler aynı çıkar", async () => {
    for (const t of db.tables) await t.clear();
    const { data: first } = await supabase.from("sync_changes").select("id").order("id", { ascending: true }).limit(1);
    pullCursor = ((first?.[0]?.id as number | undefined) ?? 1) - 1;
    const applied = await pullAll();
    expect(applied).toBeGreaterThan(0);

    const server = await one<{ stock_available: number }>("products", bujiId);
    const expectedBuji = (hasReturns ? 8 : 12) - (hasDue ? 3 : 0); // 7c: −4 satış +1 iade −1 geri alma; 7d: +3 alım −2 iade; 7e: −2 servis +1 iade
    near(server.stock_available, expectedBuji);
    expect((await getProductBalance(bujiId)).available).toBe(expectedBuji);
    // makine alımı (2 × 4.000 TL) yapıldıysa borç 8.000 TL artmıştır
    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe((hasSerial ? 1115000 : 315000) + (hasReturns ? 15000 - 10000 : 0));
    if (hasSerial) expect((await getProductBalance(machineProductId)).available).toBe(1);
    console.log(`[e2e] ${applied} değişiklik çekildi · doğrulanan adımlar: ${created.join(", ")}`);
  });
});
