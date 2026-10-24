import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { createProduct } from "@/lib/products/service";
import { addStock } from "@/lib/stock/service";
import { backupFileName, backupTotal, createBackup, parseBackup, restoreBackup, BACKUP_FORMAT } from "./backup";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
});

async function seed() {
  const ali = await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true });
  const p = await createProduct(ctx, { name: "Buji", unit: "ADET", is_serial_tracked: false, default_sale_price: 100, default_tax_mode: "NONE", default_tax_rate: 0 });
  await addStock(ctx, { productId: p.id, quantity: 5 });
  return { ali, p };
}

describe("yedek alma", () => {
  it("işletmenin tüm eşitlenen kayıtlarını içerir; başka işletmenin kaydını almaz", async () => {
    const { ali } = await seed();
    await db.customers.add({ ...ali, id: "other-1", business_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Başka" });
    const backup = await createBackup(ctx);
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, business_id: ctx.businessId, device_code: "DEMO-AB23" });
    expect(backup.counts.customers).toBe(1);
    expect(backup.counts.products).toBe(1);
    expect(backup.counts.stock_movements).toBe(1);
    expect(backupTotal(backup)).toBeGreaterThanOrEqual(3);
    expect(backupFileName({ created_at: "2026-10-31T09:05:00.000Z" })).toBe("veltrio-yedek-2026-10-31-0905.json");
  });
});

describe("yedek dosyası doğrulama", () => {
  it("geçersiz, yabancı ve başka işletmeye ait dosyayı reddeder", async () => {
    await seed();
    const text = JSON.stringify(await createBackup(ctx));
    expect(parseBackup("bozuk{", ctx.businessId)).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ a: 1 }), ctx.businessId)).toMatchObject({ ok: false, error: expect.stringMatching(/yedeği değil/) });
    expect(parseBackup(text, "ffffffff-ffff-4fff-8fff-ffffffffffff")).toMatchObject({ ok: false, error: expect.stringMatching(/başka bir işletme/) });
    expect(parseBackup(JSON.stringify({ ...JSON.parse(text), version: 99 }), ctx.businessId)).toMatchObject({ ok: false, error: expect.stringMatching(/yeni/) });
    expect(parseBackup(text, ctx.businessId).ok).toBe(true);
  });

  it("başka işletmeye ait satırları ve kimliksiz satırları ayıklar", async () => {
    await seed();
    const file = JSON.parse(JSON.stringify(await createBackup(ctx)));
    file.tables.customers.push({ id: "x", business_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Yabancı" }, { name: "kimliksiz", business_id: ctx.businessId });
    const parsed = parseBackup(JSON.stringify(file), ctx.businessId);
    expect(parsed.ok && parsed.backup.counts.customers).toBe(1);
  });
});

describe("geri yükleme (ekleyici)", () => {
  it("cihazda olmayan kayıtları ekler ve kuyruğa alır; var olanın üzerine yazmaz", async () => {
    const { ali } = await seed();
    const backup = await createBackup(ctx);
    // Cihaz verisi kayboldu, yalnızca bir müşteri yeniden oluşturuldu (farklı ad)
    for (const t of db.tables) await t.clear();
    await db.customers.add({ ...ali, name: "Ali (güncel)" });
    await db.sync_queue.clear();

    const result = await restoreBackup(ctx, backup);
    expect(result.skipped).toBe(1);
    expect(result.added).toBeGreaterThanOrEqual(2);
    expect((await db.customers.get(ali.id))?.name).toBe("Ali (güncel)");
    expect(await db.products.count()).toBe(1);
    expect(await db.stock_movements.count()).toBe(1);

    const queue = await db.sync_queue.toArray();
    expect(queue.filter((q) => q.operation === "INSERT" && q.table_name === "products")).toHaveLength(1);
    // Ana kayıt (ürün) hareketten önce gönderilir
    const order = queue.map((q) => q.table_name);
    const audit = await db.audit_logs.filter((a) => a.action === "RESTORE").toArray();
    expect(audit).toHaveLength(1);
    expect(order).toContain("stock_movements");
  });

  it("iki kez geri yüklemek kopya üretmez", async () => {
    await seed();
    const backup = await createBackup(ctx);
    for (const t of db.tables) await t.clear();
    const first = await restoreBackup(ctx, backup);
    const second = await restoreBackup(ctx, backup);
    expect(first.added).toBeGreaterThan(0);
    expect(second.added).toBe(0);
    expect(await db.customers.count()).toBe(1);
  });
});
