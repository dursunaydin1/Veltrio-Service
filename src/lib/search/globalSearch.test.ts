import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer, setCustomerArchived } from "@/lib/customers/service";
import { createMachine } from "@/lib/machines/service";
import { createProduct } from "@/lib/products/service";
import { createSupplier } from "@/lib/suppliers/service";
import { openService } from "@/lib/services/service";
import { matchesPhone, matchesWords, parseQuery, searchAll } from "./globalSearch";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

describe("arama yardımcıları", () => {
  it("Türkçe karakter ve harf büyüklüğünden bağımsız, tüm kelimeler eşleşmeli", () => {
    expect(matchesWords(["camlica", "koyu"], "Çamlıca Köyü")).toBe(true);
    expect(matchesWords(["camlica", "mah"], "Çamlıca Köyü")).toBe(false);
    expect(matchesWords([], "x")).toBe(false);
  });

  it("telefon: boşluk/tire/+90/0 farkı olmadan, en az 4 hane", () => {
    expect(parseQuery("0532 123-45").digits).toBe("053212345");
    expect(matchesPhone(parseQuery("0532 123-45").digits, "+90 532 123 45 67")).toBe(true);
    expect(matchesPhone("5321234567", "+90 532 123 45 67")).toBe(true);
    expect(matchesPhone("1234", "0532 123 45 67")).toBe(true);
    expect(matchesPhone("123", "0532 123 45 67")).toBe(false);
    expect(matchesPhone("5321234567", undefined)).toBe(false);
  });
});

describe("genel arama (FR-024, AC-022)", () => {
  let ali: string;

  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
    ali = (await createCustomer(ctx, { name: "Ali Yılmaz", phone: "0532 123 45 67", village: "Çamlıca", no_phone_flag: false })).id;
    const machine = await createMachine(ctx, { customer_id: ali, type: "Testere", brand: "Stihl", model: "MS 180", serial_number: "SN-7788", is_temporary: false });
    await openService(ctx, { customerId: ali, machineId: machine.id, complaint: "Çalışmıyor" });
    await createProduct(ctx, { name: "NGK Buji", code: "BJ-01", unit: "ADET", is_serial_tracked: false, default_sale_price: 100, default_tax_mode: "NONE", default_tax_rate: 0 });
    await createSupplier(ctx, { name: "Orman Makine", phone: "0212 555 00 11" });
  });

  const kinds = (hits: { kind: string }[]) => hits.map((h) => h.kind).sort();

  it("müşteri adını (Türkçe karaktersiz), telefonu ve köyü bulur; sonuçlar türüyle etiketlenir", async () => {
    // Müşteri adı, o müşterinin servisinde de aranabilir
    expect(kinds(await searchAll(ctx.businessId, "yilmaz"))).toEqual(["customer", "service"]);
    const byPhone = await searchAll(ctx.businessId, "+90 532 123 45 67");
    expect(byPhone.map((h) => [h.kind, h.href])).toEqual([["customer", `/customers/${ali}`]]);
    expect(kinds(await searchAll(ctx.businessId, "camlica"))).toEqual(["customer"]);
  });

  it("makineyi seri no ve iç no ile, servisi belge numarasıyla, ürünü kodla, tedarikçiyi adla bulur", async () => {
    expect(kinds(await searchAll(ctx.businessId, "SN-7788"))).toEqual(["machine"]);
    expect(kinds(await searchAll(ctx.businessId, "MK-DEMO"))).toEqual(["machine"]);
    expect(kinds(await searchAll(ctx.businessId, "S-DEMO-AB23"))).toEqual(["service"]);
    expect(kinds(await searchAll(ctx.businessId, "bj-01"))).toEqual(["product"]);
    expect(kinds(await searchAll(ctx.businessId, "orman"))).toEqual(["supplier"]);
    expect(kinds(await searchAll(ctx.businessId, "0212 555"))).toEqual(["supplier"]);
  });

  it("kısa sorgu sonuç vermez; arşivdekiler varsayılan olarak hariçtir, seçenekle gelir", async () => {
    expect(await searchAll(ctx.businessId, "a")).toEqual([]);
    await setCustomerArchived(ctx, ali, true).catch(() => undefined);
    // Açık servis olduğundan arşivleme engellenir: doğrudan arşivleyip davranışı sına
    const c = (await db.customers.get(ali))!;
    await db.customers.put({ ...c, archived_at: "2026-01-01T00:00:00Z" });
    expect(kinds(await searchAll(ctx.businessId, "yilmaz"))).not.toContain("customer");
    const withArchived = await searchAll(ctx.businessId, "yilmaz", { includeArchived: true });
    const archivedHit = withArchived.find((h) => h.kind === "customer");
    expect(archivedHit?.archived).toBe(true);
  });

  it("başka işletmenin kaydını getirmez", async () => {
    expect(await searchAll("ffffffff-ffff-4fff-8fff-ffffffffffff", "yilmaz")).toEqual([]);
  });
});
