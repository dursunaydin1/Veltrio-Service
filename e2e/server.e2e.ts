import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { getSupplierBalance, recordSupplierPayment, setSupplierOpeningBalance } from "@/lib/finance/service";
import { createProduct } from "@/lib/products/service";
import { createPurchase } from "@/lib/purchases/service";
import { createSale, getSaleBalance } from "@/lib/sales/service";
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
  return { pushed, conflicts };
}

/** Sunucudaki kayıtları (başka bir cihaz gibi) yerel veritabanına çeker. */
async function pullAll() {
  let cursor = 0;
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

  beforeAll(async () => {
    supabase = createClient(URL as string, ANON as string, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL as string, password: PASSWORD as string });
    if (error || !data.user) throw new Error(`Giriş yapılamadı: ${error?.message}`);

    const { data: profile } = await supabase.from("users").select("business_id").eq("id", data.user.id).single();
    ctx = { businessId: profile?.business_id as string, deviceCode: DEVICE, actorId: data.user.id };

    const probe = await supabase.from("product_serial_units").select("internal_number").limit(1);
    hasSerial = !probe.error;
  });

  it("0) bağlantı: oturum, işletme ve migration durumu", () => {
    expect(ctx.businessId).toMatch(/^[0-9a-f-]{36}$/);
    console.log(`[e2e] cihaz=${DEVICE} · migration 018 (seri birim): ${hasSerial ? "VAR" : "YOK"}`);
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

    const row = await one<{ status: string; total_amount: number; finalized_at: string | null; customer_id: string }>("sales", sale.id);
    expect(row).toMatchObject({ status: "FINAL", customer_id: customerId });
    near(row.total_amount, 200);

    const { data: pays } = await supabase.from("payments").select("amount,customer_id,source_type").eq("source_id", sale.id);
    expect(pays).toHaveLength(1);
    expect(pays?.[0]).toMatchObject({ customer_id: customerId, source_type: "SALE" });

    near((await one<{ stock_available: number }>("products", bujiId)).stock_available, 13);
    expect(await getSaleBalance(sale.id)).toEqual({ total: 20000, paid: 5000, remaining: 15000 });
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
    const pending = await db.sales.where("business_id").equals(ctx.businessId).first();
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

  it("8) başka bir cihaz gibi çekme: yerel veri silinip sunucudan alınınca stok ve bakiyeler aynı çıkar", async () => {
    for (const t of db.tables) await t.clear();
    const applied = await pullAll();
    expect(applied).toBeGreaterThan(0);

    const server = await one<{ stock_available: number }>("products", bujiId);
    near(server.stock_available, 12);
    expect((await getProductBalance(bujiId)).available).toBe(12);
    // makine alımı (2 × 4.000 TL) yapıldıysa borç 8.000 TL artmıştır
    expect((await getSupplierBalance(ctx.businessId, supplierId)).balance).toBe(hasSerial ? 1115000 : 315000);
    if (hasSerial) expect((await getProductBalance(machineProductId)).available).toBe(1);
    console.log(`[e2e] ${applied} değişiklik çekildi · doğrulanan adımlar: ${created.join(", ")}`);
  });
});
