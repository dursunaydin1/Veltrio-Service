import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/customers/service";
import { createMachine } from "@/lib/machines/service";
import { createProduct } from "@/lib/products/service";
import { addPart, setPartSupply } from "@/lib/services/quote";
import { changeServiceStatus, openService, type ServiceContext } from "@/lib/services/service";
import {
  planServiceNotifications,
  summarizeServices,
  syncServiceNotifications,
  type ServiceFacts,
} from "./serviceReminders";

const ctx: ServiceContext = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

const facts = (over: Partial<ServiceFacts> = {}): ServiceFacts => ({
  id: "s1", documentNo: "S-1", customerName: "Ali", status: "IN_PROGRESS", firstCompleted: false, waitingParts: false, ...over,
});
const keys = (list: { dedupeKey: string }[]) => list.map((p) => p.dedupeKey);

describe("servis bildirim planı (SR-014, SR-019)", () => {
  it("teslim tarihi: 1 gün önce yaklaşan, günü ve sonrası gecikme (her gün ayrı anahtar)", () => {
    const f = facts({ promisedDate: "2026-10-10" });
    expect(planServiceNotifications([f], "2026-10-08")).toEqual([]);
    expect(keys(planServiceNotifications([f], "2026-10-09"))).toEqual(["DELIVERY_REMINDER:s1:UPCOMING"]);
    expect(keys(planServiceNotifications([f], "2026-10-10"))).toEqual(["DELIVERY_REMINDER:s1:UPCOMING"]);
    expect(keys(planServiceNotifications([f], "2026-10-11"))).toEqual(["DELIVERY_REMINDER:s1:OVERDUE:2026-10-11"]);
    expect(keys(planServiceNotifications([f], "2026-10-12"))).toEqual(["DELIVERY_REMINDER:s1:OVERDUE:2026-10-12"]);
  });

  it("hatırlatma günü ayarlanabilir; teslim edilmiş / iptal servis için bildirim yok", () => {
    const f = facts({ promisedDate: "2026-10-10" });
    expect(keys(planServiceNotifications([f], "2026-10-07", 3))).toEqual(["DELIVERY_REMINDER:s1:UPCOMING"]);
    expect(planServiceNotifications([{ ...f, status: "DELIVERED" }, { ...f, status: "CANCELLED" }], "2026-10-20")).toEqual([]);
  });

  it("parça bekleniyor, onay bekleniyor ve iş tamamlandı bildirimleri durumdan türer", () => {
    expect(keys(planServiceNotifications([facts({ waitingParts: true })], "2026-10-08"))).toEqual(["PART_WAITING:s1"]);
    expect(keys(planServiceNotifications([facts({ status: "WAITING_CUSTOMER_APPROVAL" })], "2026-10-08"))).toEqual(["CUSTOMER_APPROVAL_NEEDED:s1"]);
    expect(keys(planServiceNotifications([facts({ status: "COMPLETED", firstCompleted: true })], "2026-10-08"))).toEqual(["SERVICE_COMPLETED:s1"]);
  });

  it("ana ekran özeti: aktif, onay/parça bekleyen, teslim yaklaşan/geçen", () => {
    const s = summarizeServices(
      [
        facts({ id: "a", promisedDate: "2026-10-09" }),
        facts({ id: "b", promisedDate: "2026-10-01", status: "WAITING_CUSTOMER_APPROVAL" }),
        facts({ id: "c", waitingParts: true }),
        facts({ id: "d", status: "DELIVERED", promisedDate: "2026-09-01" }),
      ],
      "2026-10-08"
    );
    expect(s).toEqual({ active: 3, waitingApproval: 1, waitingParts: 1, upcoming: 1, overdue: 1 });
  });
});

describe("servis bildirimleri (veri tabanı)", () => {
  let customerId: string;
  let machineId: string;
  let serviceId: string;
  let productId: string;

  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
    customerId = (await createCustomer(ctx, { name: "Ali", village: "K", no_phone_flag: true })).id;
    machineId = (await createMachine(ctx, { customer_id: customerId, type: "Testere", brand: "Stihl", model: "MS", is_temporary: false })).id;
    productId = (
      await createProduct(ctx, {
        name: "Buji", unit: "ADET", is_serial_tracked: false, default_sale_price: 100,
        default_tax_mode: "NONE", default_tax_rate: 0,
      })
    ).id;
    serviceId = (await openService(ctx, { customerId, machineId, complaint: "x", promisedDate: "2026-10-10" })).id;
    await db.sync_queue.clear();
  });

  it("teslim yaklaşınca bir kez üretilir, tekrar çalıştırınca yinelenmez; teslim edilince çözülür", async () => {
    expect(await syncServiceNotifications(ctx, { today: "2026-10-09" })).toBe(1);
    expect(await syncServiceNotifications(ctx, { today: "2026-10-09" })).toBe(0);
    const [n] = await db.notifications.toArray();
    expect(n).toMatchObject({ type: "DELIVERY_REMINDER", related_record_id: serviceId });
    expect(n.resolved_at).toBeUndefined();

    // Gecikme: yaklaşan bildirimi kapanır, günün gecikme bildirimi açılır; ertesi gün eskisi çözülür
    expect(await syncServiceNotifications(ctx, { today: "2026-10-11" })).toBe(1);
    expect(await syncServiceNotifications(ctx, { today: "2026-10-12" })).toBe(1);
    const open = (await db.notifications.toArray()).filter((x) => !x.resolved_at);
    expect(open.map((x) => x.dedupe_key)).toEqual([`DELIVERY_REMINDER:${serviceId}:OVERDUE:2026-10-12`]);

    await changeServiceStatus(ctx, serviceId, "CANCELLED", "vazgeçti");
    await syncServiceNotifications(ctx, { today: "2026-10-13" });
    expect((await db.notifications.toArray()).filter((x) => !x.resolved_at)).toHaveLength(0);
  });

  it("parça sipariş edilecekken 'Parça bekleniyor' üretilir; gelince çözülür (SR-019)", async () => {
    const part = await addPart(ctx, serviceId, { sourceType: "NON_STOCK_PURCHASE", description: "Conta", quantity: 1, unitPriceKurus: 1000 });
    expect(await syncServiceNotifications(ctx, { today: "2026-10-01" })).toBe(0);

    await setPartSupply(ctx, part.id, "TO_ORDER", "2026-10-05");
    expect((await db.service_parts.get(part.id))?.expected_at).toBe("2026-10-05");
    expect(await syncServiceNotifications(ctx, { today: "2026-10-01" })).toBe(1);
    expect(await syncServiceNotifications(ctx, { today: "2026-10-02" })).toBe(0);

    await setPartSupply(ctx, part.id, "ARRIVED");
    expect((await db.service_parts.get(part.id))?.expected_at).toBeUndefined();
    await syncServiceNotifications(ctx, { today: "2026-10-03" });
    const notes = (await db.notifications.toArray()).filter((n) => n.type === "PART_WAITING");
    expect(notes).toHaveLength(1);
    expect(notes[0].resolved_at).toBeTruthy();
    expect(productId).toBeTruthy();
  });

  it("temin durumu geçersiz tarih ve kapanmış serviste reddedilir", async () => {
    const part = await addPart(ctx, serviceId, { sourceType: "NON_STOCK_PURCHASE", description: "Conta", quantity: 1, unitPriceKurus: 1000 });
    await expect(setPartSupply(ctx, part.id, "ORDERED", "yarın")).rejects.toThrow(/geçersiz/);
    await changeServiceStatus(ctx, serviceId, "CANCELLED", "x");
    await expect(setPartSupply(ctx, part.id, "ORDERED")).rejects.toThrow(/değiştirilemez/);
  });
});
