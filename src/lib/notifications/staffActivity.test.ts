import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { unreadCount } from "./center";
import { loadActivity, otherPeoplesDevices, staffActivityHref, syncStaffActivityNotifications } from "./staffActivity";

const B = "00000000-0000-0000-0000-000000000001";
const OWNER_DEVICE = "VLT-OWNR";
const STAFF_DEVICE = "VLT-STF1";
const ctx = { businessId: B, deviceCode: OWNER_DEVICE };
const staff = new Map([[STAFF_DEVICE, "Ahmet"]]);

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    dispatchEvent: () => true,
  });
});
afterEach(() => vi.unstubAllGlobals());

const at = (minute: number) => `2026-11-11T09:${String(minute).padStart(2, "0")}:00.000Z`;

async function seed() {
  await db.customers.bulkAdd([
    { id: "c1", business_id: B, name: "Mehmet Yılmaz", created_by_device: STAFF_DEVICE, created_at: at(10), updated_at: at(10) },
    { id: "c2", business_id: B, name: "Patronun müşterisi", created_by_device: OWNER_DEVICE, created_at: at(11), updated_at: at(11) },
    { id: "c3", business_id: B, name: "Eski kayıt", created_at: at(12), updated_at: at(12) },
  ] as never);
  await db.services.add({ id: "s1", business_id: B, document_no: "SRV-001", customer_id: "c1", status: "DELIVERED", created_by_device: STAFF_DEVICE, created_at: at(13), updated_at: at(13) } as never);
  await db.service_status_history.bulkAdd([
    { id: "h1", business_id: B, service_id: "s1", from_status: "RECEIVED", to_status: "IN_PROGRESS", changed_by_device: STAFF_DEVICE, changed_at: at(14) },
    { id: "h2", business_id: B, service_id: "s1", from_status: "COMPLETED", to_status: "DELIVERED", changed_by_device: STAFF_DEVICE, changed_at: at(15) },
  ] as never);
  await db.sales.bulkAdd([
    { id: "sa1", business_id: B, document_no: "SAT-1", customer_id: "c1", status: "FINAL", total_amount: 2450, finalized_at: at(16), created_by_device: STAFF_DEVICE, created_at: at(16) },
    { id: "sa2", business_id: B, document_no: "SAT-2", status: "DRAFT", total_amount: 10, created_by_device: STAFF_DEVICE, created_at: at(17) },
  ] as never);
  await db.payments.bulkAdd([
    { id: "p1", business_id: B, direction: "IN", status: "VALID", amount: 2450, source_type: "SALE", source_id: "sa1", customer_id: "c1", created_by_device: STAFF_DEVICE, created_at: at(16) },
    { id: "p2", business_id: B, direction: "IN", status: "VALID", amount: 1000, source_type: "SERVICE", source_id: "s1", customer_id: "c1", created_by_device: STAFF_DEVICE, created_at: at(18) },
  ] as never);
}

describe("çalışanın yaptıkları (K-121)", () => {
  it("yalnızca verilen cihazların işleri, yeniden eskiye; taslak satış, ara durum ve satış tahsilatı yazılmaz", async () => {
    await seed();
    const items = await loadActivity(B, new Set([STAFF_DEVICE]));
    expect(items.map((i) => i.key)).toEqual(["PAYMENT:p2", "SALE:sa1", "SERVICE_DELIVERED:h2", "SERVICE_OPENED:s1", "CUSTOMER:c1"]);
    expect(items[1].text).toMatch(/^satış yaptı: .*2\.450.* · Mehmet Yılmaz$/);
    expect(items[2]).toMatchObject({ text: "servisi teslim etti: SRV-001 · Mehmet Yılmaz", href: "/services/s1" });
  });

  it("patronun kendi cihazları çalışan sayılmaz", () => {
    const others = otherPeoplesDevices({ [STAFF_DEVICE]: "Ahmet" }, { [OWNER_DEVICE]: "owner-id", [STAFF_DEVICE]: "staff-id", "VLT-NEW": "staff-id" }, "owner-id");
    expect([...others]).toEqual([[STAFF_DEVICE, "Ahmet"], ["VLT-NEW", "Çalışan"]]);
  });

  it("bildirime dokununca ilgili kayıt açılır", () => {
    expect(staffActivityHref("STAFF:SALE:sa1", "sa1")).toBe("/sales/sa1");
    expect(staffActivityHref("STAFF:SERVICE_DELIVERED:h2", "s1")).toBe("/services/s1");
    expect(staffActivityHref("STAFF:PAYMENT:p2", "c1")).toBe("/customers/c1");
    expect(staffActivityHref("LOW_STOCK:p1:1", "p1")).toBeNull();
  });

  it("ilk çalışmada geçmiş bildirilmez; sonraki işler bir kez bildirilir; çalışana gösterilmez", async () => {
    await seed();
    expect(await syncStaffActivityNotifications(ctx, staff, at(30))).toBe(0);

    await db.customers.add({ id: "c9", business_id: B, name: "Yeni Müşteri", created_by_device: STAFF_DEVICE, created_at: at(31), updated_at: at(31) } as never);
    expect(await syncStaffActivityNotifications(ctx, staff, at(32))).toBe(1);
    expect(await syncStaffActivityNotifications(ctx, staff, at(33))).toBe(0);

    const [n] = await db.notifications.toArray();
    expect(n).toMatchObject({ type: "STAFF_ACTIVITY", message: "Ahmet yeni müşteri ekledi: Yeni Müşteri", related_record_id: "c9" });
    expect(await unreadCount(B, true)).toBe(1);
    expect(await unreadCount(B, false)).toBe(0);
  });
});
