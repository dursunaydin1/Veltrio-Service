import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseProductForm, type ProductFormInput } from "./schema";
import { isCriticalStock } from "./stock";
import {
  ProductCodeTakenError,
  ProductNotFoundError,
  createProduct,
  setProductArchived,
  updateProduct,
} from "./service";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

const form = (over: Partial<ProductFormInput> = {}): ProductFormInput => ({
  name: "NGK Buji",
  code: "BJ-001",
  category: "Buji",
  brand: "NGK",
  model: "",
  unit: "ADET",
  isSerialTracked: false,
  salePrice: "1.250,50",
  lastPurchasePrice: "900",
  taxMode: "INCLUSIVE",
  taxRate: "20",
  criticalStockLevel: "5",
  compatibleModelsNote: "",
  storageLocation: "",
  ...over,
});

function fieldsOf(over: Partial<ProductFormInput> = {}) {
  const r = parseProductForm(form(over));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.fields;
}

describe("parseProductForm", () => {
  it("metin girdilerini veritabanı alanlarına çevirir", () => {
    expect(fieldsOf()).toMatchObject({
      name: "NGK Buji",
      code: "BJ-001",
      brand: "NGK",
      model: undefined,
      default_sale_price: 1250.5,
      last_purchase_price: 900,
      default_tax_rate: 20,
      critical_stock_level: 5,
    });
  });

  it("isteğe bağlı alanlar boşsa undefined olur", () => {
    const f = fieldsOf({ code: "  ", lastPurchasePrice: "", criticalStockLevel: "" });
    expect(f.code).toBeUndefined();
    expect(f.last_purchase_price).toBeUndefined();
    expect(f.critical_stock_level).toBeUndefined();
  });

  it("ondalıklı kritik seviye ve KDV oranı kabul edilir", () => {
    const f = fieldsOf({ criticalStockLevel: "2,5", taxRate: "18,5" });
    expect(f.critical_stock_level).toBe(2.5);
    expect(f.default_tax_rate).toBe(18.5);
  });

  it("hataları alan adıyla döner", () => {
    const r = parseProductForm(form({ name: " ", salePrice: "abc", taxRate: "150" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["name", "salePrice", "taxRate"]);
    }
  });
});

describe("isCriticalStock", () => {
  it("eşitse veya altındaysa kritiktir, seviye yoksa değildir", () => {
    expect(isCriticalStock({ stock_available: 5, critical_stock_level: 5 })).toBe(true);
    expect(isCriticalStock({ stock_available: 6, critical_stock_level: 5 })).toBe(false);
    expect(isCriticalStock({ stock_available: 0, critical_stock_level: undefined })).toBe(false);
  });
});

describe("ürün servisi", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.sync_queue.clear();
    await db.audit_logs.clear();
  });

  it("ürün oluşturur: yerelde kayıt + kuyrukta INSERT, stok 0", async () => {
    const p = await createProduct(ctx, fieldsOf());
    expect(await db.products.get(p.id)).toMatchObject({ name: "NGK Buji", stock_available: 0 });

    const [q] = await db.sync_queue.toArray();
    expect(q).toMatchObject({ table_name: "products", record_id: p.id, operation: "INSERT" });
    expect(q.payload).toMatchObject({ id: p.id, business_id: ctx.businessId, stock_available: 0, brand: "NGK" });
    expect(q.payload.model).toBeNull();
  });

  it("aynı kodu (büyük/küçük harf fark etmeden) ikinci kez kabul etmez", async () => {
    await createProduct(ctx, fieldsOf());
    await expect(createProduct(ctx, fieldsOf({ code: "bj-001" }))).rejects.toBeInstanceOf(ProductCodeTakenError);
    expect(await db.products.count()).toBe(1);
    expect(await db.sync_queue.count()).toBe(1);
  });

  it("kodsuz ürünlerden istendiği kadar eklenebilir", async () => {
    await createProduct(ctx, fieldsOf({ code: "" }));
    await createProduct(ctx, fieldsOf({ code: "" }));
    expect(await db.products.count()).toBe(2);
  });

  it("henüz gönderilmemiş ürünü güncellemek INSERT paketini günceller", async () => {
    const p = await createProduct(ctx, fieldsOf());
    await updateProduct(ctx, p.id, fieldsOf({ name: "NGK Buji CR7" }));

    const queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ operation: "INSERT" });
    expect(queue[0].payload.name).toBe("NGK Buji CR7");
  });

  it("eşitlenmiş ürünü güncellemek version ile UPDATE kuyruğa atar, stok alanı göndermez", async () => {
    const p = await createProduct(ctx, fieldsOf());
    await db.sync_queue.clear();
    // sunucudan geri çekilmiş hâli: version var, stok 7
    await db.products.put({ ...p, version: 4, stock_available: 7 });

    await updateProduct(ctx, p.id, fieldsOf({ brand: "" }));

    const [q] = await db.sync_queue.toArray();
    expect(q.operation).toBe("UPDATE");
    expect(q.payload).toMatchObject({ version: 4, brand: null });
    expect(q.payload).not.toHaveProperty("stock_available");
    expect((await db.products.get(p.id))?.stock_available).toBe(7);
  });

  it("başka ürünün koduna güncelleme reddedilir, kendi kodunu korumak serbesttir", async () => {
    await createProduct(ctx, fieldsOf({ code: "A" }));
    const b = await createProduct(ctx, fieldsOf({ code: "B" }));
    await expect(updateProduct(ctx, b.id, fieldsOf({ code: "a" }))).rejects.toBeInstanceOf(ProductCodeTakenError);
    await expect(updateProduct(ctx, b.id, fieldsOf({ code: "B", name: "Yeni ad" }))).resolves.toBeTruthy();
  });

  it("olmayan ürünü güncellemek hata verir", async () => {
    await expect(updateProduct(ctx, "yok", fieldsOf())).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("pasifleştirme: archived_at dolar, audit log yazılır; geri alma null gönderir", async () => {
    const p = await createProduct(ctx, fieldsOf());
    await db.sync_queue.clear();
    await db.products.put({ ...p, version: 2 });

    const archived = await setProductArchived(ctx, p.id, true, "Satışı bitti");
    expect(archived.archived_at).toBeTruthy();
    const logs = await db.audit_logs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity_type: "products", action: "STATE_CHANGE", reason: "Satışı bitti", actor_id: "u1" });

    const restored = await setProductArchived(ctx, p.id, false);
    expect(restored.archived_at).toBeUndefined();
    const updates = (await db.sync_queue.toArray()).filter((q) => q.table_name === "products");
    expect(updates).toHaveLength(1); // arka arkaya düzenlemeler tek pakette
    expect(updates[0].payload).toMatchObject({ archived_at: null, version: 2 });
  });
});
