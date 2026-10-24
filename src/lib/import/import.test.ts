import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { getCustomerBalance } from "@/lib/finance/service";
import { createProduct } from "@/lib/products/service";
import { getProductBalance } from "@/lib/stock/ledger";
import { createSupplier } from "@/lib/suppliers/service";
import { DuplicateImportError, applyImport, loadBalanceContext, loadCustomerContext, loadProductContext } from "./apply";
import { IMPORT_DEFS, applyMapping, suggestMapping } from "./definitions";
import { parseFileBytes, sha256Hex } from "./parse";
import { validateCustomers, validateOpeningBalances, validateOpeningStock, validateProducts, type Decision } from "./validate";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };
const enc = (s: string) => new TextEncoder().encode(s);

/** Dosya metninden doğrulanmış satırlara kadar tüm hat (uygulamadaki sihirbazla aynı). */
async function prepare(kind: keyof typeof IMPORT_DEFS, csv: string) {
  const bytes = enc(csv);
  const table = parseFileBytes(bytes, "dosya.csv");
  const fields = IMPORT_DEFS[kind].fields;
  const raw = applyMapping(table.rows, fields, suggestMapping(table.headers, fields));
  return { raw, hash: await sha256Hex(bytes) };
}

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
});

describe("müşteri içe aktarma (6.2)", () => {
  const csv = "Ad Soyad;Telefon;Köy;Not\nAli Yılmaz;0532 123 45 67;Çamlıca;iyi\nVeli Demir;0533 000 11 22;;\nBozuk Tel;12;Köy;\n;0555 555 55 55;Köy;\nAli Kopya;+90 532 123 45 67;Köy;";

  it("geçerli, uyarılı ve hatalı satırları ayırır; telefon mükerrerleri seçenek sunar", async () => {
    const { raw } = await prepare("customers", csv);
    const rows = validateCustomers(raw, await loadCustomerContext(ctx.businessId));
    expect(rows.map((r) => r.errors.length)).toEqual([0, 0, 1, 1, 0]);
    expect(rows[1].warnings.join()).toMatch(/Belirtilmedi/);
    expect(rows[4].duplicate).toMatchObject({ inFile: true });
    expect(rows[4].decisions).toEqual(["MATCH", "CREATE"]);
  });

  it("uygular: hatalılar yazılmaz, mükerrer varsayılan olarak atlanır; ImportBatch ve kuyruk oluşur", async () => {
    const { raw, hash } = await prepare("customers", csv);
    const rows = validateCustomers(raw, await loadCustomerContext(ctx.businessId));
    const result = await applyImport(ctx, "customers", { name: "musteriler.csv", hash }, rows);
    expect(result).toMatchObject({ created: 2, matched: 1, errors: 2 });
    const names = (await db.customers.toArray()).map((c) => c.name).sort();
    expect(names).toEqual(["Ali Yılmaz", "Veli Demir"]);
    const batch = (await db.import_batches.toArray())[0];
    expect(batch).toMatchObject({ file_hash: hash, row_count: 2, error_count: 2, status: "COMPLETED" });
    expect((await db.sync_queue.toArray()).some((q) => q.table_name === "import_batches" && q.operation === "INSERT")).toBe(true);
  });

  it("mevcut müşteriyle eşleşen satır: birleştir boşları doldurur, ayrı kayıt ikinci müşteri açar", async () => {
    await createCustomer(ctx, { name: "Ali Y.", phone: "0532 123 45 67", phone_normalized: "5321234567", no_phone_flag: false, village: "Kasaba" });
    const { raw, hash } = await prepare("customers", "Ad;Telefon;Köy;Not\nAli Yılmaz;0532 123 45 67;Çamlıca;yeni not");
    const rows = validateCustomers(raw, await loadCustomerContext(ctx.businessId));
    expect(rows[0].duplicate?.label).toMatch(/Ali Y\./);
    await applyImport(ctx, "customers", { name: "a.csv", hash }, rows, new Map<number, Decision>([[2, "MERGE"]]));
    const all = await db.customers.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: "Ali Y.", village: "Kasaba", notes: "yeni not" }); // dolu alan korunur, boş alan dolar

    const second = await prepare("customers", "Ad;Telefon;Köy;Not\nBaşka Ali;0532 123 45 67;Köy;");
    await applyImport(ctx, "customers", { name: "b.csv", hash: second.hash }, validateCustomers(second.raw, await loadCustomerContext(ctx.businessId)), new Map<number, Decision>([[2, "CREATE"]]));
    expect(await db.customers.count()).toBe(2);
  });
});

describe("aynı dosya iki kez yüklenemez (AC-047, TC-048)", () => {
  it("ikinci uygulama DuplicateImportError verir ve hiçbir kayıt eklemez", async () => {
    const { raw, hash } = await prepare("customers", "Ad;Telefon;Köy\nAli;0532 111 22 33;K");
    const rows = validateCustomers(raw, await loadCustomerContext(ctx.businessId));
    await applyImport(ctx, "customers", { name: "x.csv", hash }, rows);
    await expect(applyImport(ctx, "customers", { name: "x.csv", hash }, rows)).rejects.toBeInstanceOf(DuplicateImportError);
    expect(await db.customers.count()).toBe(1);
    expect(await db.import_batches.count()).toBe(1);
  });
});

describe("ürün içe aktarma (6.3)", () => {
  it("birim, fiyat, kritik stok ve KDV'yi okur; kod tekrarını uyarır; işletme KDV varsayılanını kullanır", async () => {
    await createProduct(ctx, { name: "NGK Buji", code: "BJ-01", unit: "ADET", is_serial_tracked: false, default_sale_price: 100, default_tax_mode: "NONE", default_tax_rate: 0 });
    const csv = "Ürün;Kod;Kategori;Birim;Satış Fiyatı;Kritik Stok;KDV\nZincir;ZN-1;Zincir;adet;1.250,50;5;10\nBuji Yeni;bj-01;Buji;;50;;\nYağ;YG;Yağ;litre;abc;;\nPaket;PK;;kasa;10;;";
    const { raw, hash } = await prepare("products", csv);
    const rows = validateProducts(raw, await loadProductContext(ctx.businessId));
    expect(rows[0].data).toMatchObject({ unit: "ADET", default_sale_price: 1250.5, critical_stock_level: 5, default_tax_rate: 10 });
    expect(rows[1].duplicate?.label).toMatch(/BJ-01/);
    expect(rows[1].decisions).toEqual(["MATCH", "MERGE"]); // aynı kodla ikinci ürün açılamaz
    expect(rows[2].errors[0]).toMatch(/Satış fiyatı geçersiz/);
    expect(rows[3].errors[0]).toMatch(/Birim tanınmadı/);

    const result = await applyImport(ctx, "products", { name: "u.csv", hash }, rows, new Map(), { taxMode: "EXCLUSIVE", taxRate: 18 });
    expect(result).toMatchObject({ created: 1, matched: 1, errors: 2 });
    const zincir = (await db.products.toArray()).find((p) => p.name === "Zincir");
    expect(zincir).toMatchObject({ default_tax_mode: "EXCLUSIVE", default_tax_rate: 10, stock_available: 0 });
  });
});

describe("açılış stoğu içe aktarma (6.4, AC-015, TC-017)", () => {
  it("her satır bir OPENING hareketi üretir ve ImportBatch'e bağlanır; bilinmeyen / seri takipli ürün hata", async () => {
    await createProduct(ctx, { name: "NGK Buji", code: "BJ-01", unit: "ADET", is_serial_tracked: false, default_sale_price: 100, default_tax_mode: "NONE", default_tax_rate: 0 });
    await createProduct(ctx, { name: "Testere", unit: "ADET", is_serial_tracked: true, default_sale_price: 100, default_tax_mode: "NONE", default_tax_rate: 0 });
    const csv = "Ürün;Miktar;Tarih;Açıklama\nbj-01;12;05.10.2026;Sayım\nNGK Buji;3;;\nYok Ürün;1;;\nTestere;1;;\nBJ-01;0;;\nBJ-01;2;31.02.2026;";
    const { raw, hash } = await prepare("opening-stock", csv);
    const rows = validateOpeningStock(raw, await loadProductContext(ctx.businessId));
    expect(rows.map((r) => r.errors.length > 0)).toEqual([false, false, true, true, true, true]);
    const result = await applyImport(ctx, "opening-stock", { name: "stok.csv", hash }, rows);
    expect(result).toMatchObject({ created: 2, errors: 4 });

    const buji = (await db.products.toArray()).find((p) => p.code === "BJ-01")!;
    expect((await getProductBalance(buji.id)).available).toBe(15);
    const moves = await db.stock_movements.toArray();
    expect(moves.every((m) => m.movement_type === "OPENING" && m.source_type === "IMPORT" && m.source_id === result.batchId)).toBe(true);
  });
});

describe("açılış bakiyesi içe aktarma (6.5, AC-015, AC-047)", () => {
  it("sahte satış / ödeme üretmez; müşteri ve tedarikçi bakiyesi doğru; mevcut bakiye varsayılan olarak atlanır", async () => {
    const ali = await createCustomer(ctx, { name: "Ali Yılmaz", village: "K", no_phone_flag: true });
    await createSupplier(ctx, { name: "Orman Makine" });
    const csv = "Taraf;Tür;Yön;Tutar;Tarih;Açıklama\nAli Yılmaz;Müşteri;Borçlu;1.250,50;01.10.2026;Defter\nOrman Makine;Tedarikçi;Borçlu;500;;\nBilinmeyen;;Borçlu;10;;\nAli Yılmaz;Müşteri;Alacaklı;5;;\nOrman Makine;;Yanlış;5;;";
    const { raw, hash } = await prepare("opening-balances", csv);
    const rows = validateOpeningBalances(raw, await loadBalanceContext(ctx.businessId));
    expect(rows.map((r) => r.errors.length > 0)).toEqual([false, false, true, true, true]);
    expect(rows[3].errors[0]).toMatch(/zaten bakiye var/);

    const result = await applyImport(ctx, "opening-balances", { name: "bakiye.csv", hash }, rows);
    expect(result).toMatchObject({ created: 2, errors: 3 });
    expect((await getCustomerBalance(ctx.businessId, ali.id)).balance).toBe(125050);
    expect(await db.sales.count()).toBe(0);
    expect(await db.payments.count()).toBe(0);
    const ob = await db.opening_balances.toArray();
    expect(ob.every((o) => o.import_batch_id === result.batchId)).toBe(true);

    // Aynı tarafa ikinci dosya: bakiye var → varsayılan SKIP, REPLACE seçilirse neden kayıtlı değişir
    const again = await prepare("opening-balances", "Taraf;Yön;Tutar\nAli Yılmaz;Borçlu;2000");
    const rows2 = validateOpeningBalances(again.raw, await loadBalanceContext(ctx.businessId));
    expect(rows2[0].defaultDecision).toBe("SKIP");
    expect(rows2[0].decisions).toEqual(["SKIP", "REPLACE"]);
    await applyImport(ctx, "opening-balances", { name: "bakiye2.csv", hash: again.hash }, rows2, new Map<number, Decision>([[2, "REPLACE"]]));
    expect((await getCustomerBalance(ctx.businessId, ali.id)).balance).toBe(200000);
    const audit = await db.audit_logs.filter((a) => /İçe aktarma: bakiye2/.test(a.reason ?? "")).toArray();
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });
});
