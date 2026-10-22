import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { calcSupplierBalance } from "@/lib/finance/balance";
import {
  FinanceRuleError,
  getSupplierBalance,
  recordSupplierPayment,
  reversePayment,
  setSupplierOpeningBalance,
} from "@/lib/finance/service";
import { parseSupplierForm } from "./schema";
import { SupplierRuleError, createSupplier, setSupplierArchived, updateSupplier } from "./service";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

beforeEach(async () => {
  for (const t of [db.suppliers, db.payments, db.opening_balances, db.purchases, db.sync_queue, db.audit_logs]) {
    await t.clear();
  }
});

describe("calcSupplierBalance (§9.3)", () => {
  it("açılış + alımlar − ödemeler − iadeler + tedarikçiden alınan iade ödemeleri", () => {
    const r = calcSupplierBalance({
      openingBalances: [{ direction: "OWED_TO_PARTY", amount: 1000 }],
      purchases: [500, 250.5],
      payments: [
        { direction: "OUT", amount: 600 },
        { direction: "IN", amount: 50 },
      ],
      returns: [100],
    });
    // 1000 + 750,50 − 600 − 100 + 50 = 1100,50
    expect(r.balance).toBe(110050);
  });

  it("tedarikçinin bize borcu (OWED_BY_PARTY) ve fazla ödeme negatif bakiye verir", () => {
    expect(
      calcSupplierBalance({ openingBalances: [{ direction: "OWED_BY_PARTY", amount: 200 }], purchases: [], payments: [], returns: [] }).balance
    ).toBe(-20000);
    expect(
      calcSupplierBalance({ openingBalances: [], purchases: [100], payments: [{ direction: "OUT", amount: 150 }], returns: [] }).balance
    ).toBe(-5000);
  });
});

describe("parseSupplierForm", () => {
  it("yalnızca ad zorunlu, telefon varsa geçerli olmalı", () => {
    expect(parseSupplierForm({ name: " ", phone: "", address: "", notes: "" }).ok).toBe(false);
    expect(parseSupplierForm({ name: "Yedek Parça AŞ", phone: "", address: "", notes: "" })).toMatchObject({
      ok: true,
      fields: { name: "Yedek Parça AŞ", phone: undefined },
    });
    expect(parseSupplierForm({ name: "X", phone: "123", address: "", notes: "" }).ok).toBe(false);
  });
});

describe("tedarikçi servisi", () => {
  it("oluşturur, günceller; içerik aynıysa yazmaz", async () => {
    const s = await createSupplier(ctx, { name: "Orman Makine", phone: "0212 123 45 67" });
    expect((await db.sync_queue.toArray())[0]).toMatchObject({ table_name: "suppliers", operation: "INSERT" });

    await updateSupplier(ctx, s.id, { name: "Orman Makine Ltd.", phone: "0212 123 45 67" });
    expect((await db.sync_queue.toArray()).filter((q) => q.table_name === "suppliers")).toHaveLength(1); // birleşti

    await db.sync_queue.clear();
    await updateSupplier(ctx, s.id, { name: "Orman Makine Ltd.", phone: "0212 123 45 67" });
    expect(await db.sync_queue.count()).toBe(0);
  });

  it("olmayan tedarikçi güncellenemez", async () => {
    await expect(updateSupplier(ctx, "yok", { name: "X" })).rejects.toBeInstanceOf(SupplierRuleError);
  });

  it("tedarikçiye ödeme (OUT) borcu düşürür; ters kayıt geri alır; ödeme tedarikçiye bağlanır", async () => {
    const s = await createSupplier(ctx, { name: "Orman Makine" });
    await setSupplierOpeningBalance(ctx, { supplierId: s.id, direction: "OWED_TO_PARTY", amountKurus: 100000, asOfDate: "2026-10-01" });

    const p = await recordSupplierPayment(ctx, { supplierId: s.id, direction: "OUT", method: "BANK_TRANSFER", amountKurus: 40000 });
    expect(p).toMatchObject({ supplier_id: s.id, customer_id: undefined, direction: "OUT" });
    expect((await getSupplierBalance(ctx.businessId, s.id)).balance).toBe(60000);

    await reversePayment(ctx, p.id, "Yanlış tedarikçi");
    expect((await getSupplierBalance(ctx.businessId, s.id)).balance).toBe(100000);
  });

  it("teslim alınmış alımlar borca eklenir; taslak ve iptal edilenler eklenmez", async () => {
    const s = await createSupplier(ctx, { name: "Orman Makine" });
    const t = new Date().toISOString();
    const purchase = (id: string, status: "DRAFT" | "RECEIVED" | "CANCELLED", total: number) => ({
      id, business_id: ctx.businessId, document_no: id, supplier_id: s.id, purchase_date: t,
      total_amount: total, status, created_by_device: "X", created_at: t, updated_at: t,
    });
    await db.purchases.bulkAdd([purchase("a", "RECEIVED", 700), purchase("b", "DRAFT", 300), purchase("c", "CANCELLED", 200)]);
    expect((await getSupplierBalance(ctx.businessId, s.id)).balance).toBe(70000);
  });

  it("başka işletmenin tedarikçisine ödeme yazılamaz", async () => {
    const s = await createSupplier(ctx, { name: "X" });
    await expect(
      recordSupplierPayment({ ...ctx, businessId: "baska" }, { supplierId: s.id, direction: "OUT", method: "CASH", amountKurus: 100 })
    ).rejects.toBeInstanceOf(FinanceRuleError);
  });

  it("bakiyesi sıfır olmayan tedarikçi arşivlenemez; kapanınca arşivlenir ve geri açılır", async () => {
    const s = await createSupplier(ctx, { name: "Orman Makine" });
    await setSupplierOpeningBalance(ctx, { supplierId: s.id, direction: "OWED_TO_PARTY", amountKurus: 10000, asOfDate: "2026-10-01" });
    await expect(setSupplierArchived(ctx, s.id, true)).rejects.toBeInstanceOf(SupplierRuleError);

    await recordSupplierPayment(ctx, { supplierId: s.id, direction: "OUT", method: "CASH", amountKurus: 10000 });
    const archived = await setSupplierArchived(ctx, s.id, true, "Çalışmıyoruz");
    expect(archived.archived_at).toBeTruthy();
    expect(await db.audit_logs.count()).toBeGreaterThan(0);

    const restored = await setSupplierArchived(ctx, s.id, false);
    expect(restored.archived_at).toBeUndefined();
  });
});
