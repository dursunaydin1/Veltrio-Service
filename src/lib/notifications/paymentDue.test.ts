import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { recordCustomerCollection } from "@/lib/finance/openItems";
import { createProduct } from "@/lib/products/service";
import { createSale, type SaleContext } from "@/lib/sales/service";
import { addStock } from "@/lib/stock/service";
import { planDueReminders, syncPaymentDueNotifications, type DueCandidate } from "./paymentDue";

const ctx: SaleContext = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

const cand = (over: Partial<DueCandidate> = {}): DueCandidate => ({
  kind: "SALE", id: "s1", label: "SAT-1", customerName: "Ali", dueDate: "2026-10-10", remainingKurus: 10000, ...over,
});

describe("vade hatırlatma planı (AC-038)", () => {
  it("vadeden önce hatırlatma yok; vade gününde bir; 7 günü aşınca ikinci", () => {
    expect(planDueReminders([cand()], "2026-10-09")).toEqual([]);
    expect(planDueReminders([cand()], "2026-10-10").map((r) => r.dedupeKey)).toEqual(["PAYMENT_DUE:SALE:s1:DUE"]);
    expect(planDueReminders([cand()], "2026-10-17").map((r) => r.dedupeKey)).toEqual(["PAYMENT_DUE:SALE:s1:DUE"]);
    expect(planDueReminders([cand()], "2026-10-18").map((r) => r.dedupeKey)).toEqual([
      "PAYMENT_DUE:SALE:s1:DUE",
      "PAYMENT_DUE:SALE:s1:OVERDUE7",
    ]);
  });

  it("kalanı olmayan belge için hatırlatma yok", () => {
    expect(planDueReminders([cand({ remainingKurus: 0 })], "2026-12-01")).toEqual([]);
  });
});

describe("vade bildirimleri (veri tabanı)", () => {
  let ali: string;
  let product: string;

  const sale = (dueDate?: string) =>
    createSale(
      ctx,
      { customerId: ali, dueDate, lines: [{ productId: product, quantity: 1, unitPriceKurus: 20000, taxMode: "NONE", taxRate: 0 }] },
      { finalize: true }
    );

  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
    ali = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
    product = (
      await createProduct(ctx, {
        name: "Buji", unit: "ADET", is_serial_tracked: false, default_sale_price: 100,
        default_tax_mode: "NONE", default_tax_rate: 0,
      })
    ).id;
    await addStock(ctx, { productId: product, quantity: 10 });
    await db.sync_queue.clear();
  });

  it("vadesi girilmeyen veresiye için bildirim üretilmez", async () => {
    await sale();
    expect(await syncPaymentDueNotifications(ctx, "2027-01-01")).toBe(0);
    expect(await db.notifications.count()).toBe(0);
  });

  it("vade gününde bir kez üretilir, tekrar çalıştırılınca yinelenmez; kuyruğa gider", async () => {
    const s = await sale("2026-10-10");
    expect(await syncPaymentDueNotifications(ctx, "2026-10-09")).toBe(0);
    expect(await syncPaymentDueNotifications(ctx, "2026-10-10")).toBe(1);
    expect(await syncPaymentDueNotifications(ctx, "2026-10-12")).toBe(0);
    const [n] = await db.notifications.toArray();
    expect(n).toMatchObject({ type: "PAYMENT_DUE", related_record_id: s.id, dedupe_key: `PAYMENT_DUE:SALE:${s.id}:DUE` });
    expect(n.message).toMatch(/Vade günü: Ali/);
    expect((await db.sync_queue.toArray()).filter((q) => q.table_name === "notifications")).toHaveLength(1);

    expect(await syncPaymentDueNotifications(ctx, "2026-10-18")).toBe(1);
    expect(await db.notifications.count()).toBe(2);
  });

  it("aynı olay her cihazda aynı kimliği alır (sunucuda UNIQUE çakışması olmaz)", async () => {
    await sale("2026-10-10");
    await syncPaymentDueNotifications(ctx, "2026-10-10");
    const first = (await db.notifications.toArray())[0].id;
    await db.notifications.clear();
    await syncPaymentDueNotifications({ ...ctx, deviceCode: "DEMO-ZZ99" }, "2026-10-10");
    expect((await db.notifications.toArray())[0].id).toBe(first);
  });

  it("ödeme tamamlanınca bildirim çözülür", async () => {
    const s = await sale("2026-10-10");
    await syncPaymentDueNotifications(ctx, "2026-10-10");
    await recordCustomerCollection(ctx, {
      customerId: ali, method: "CASH", amountKurus: 20000,
      allocations: [{ kind: "SALE", id: s.id, amountKurus: 20000 }],
    });
    await syncPaymentDueNotifications(ctx, "2026-10-11");
    const [n] = await db.notifications.toArray();
    expect(n.resolved_at).toBeTruthy();
  });
});
