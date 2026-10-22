import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { enqueue, markConflict, markError } from "./queue";

const BUSINESS = "00000000-0000-0000-0000-000000000001";
const ID = "11111111-1111-4111-8111-111111111111";
const DEVICE = "DEMO-AB23";

const rec = (over: Record<string, unknown> = {}) => ({
  id: ID,
  business_id: BUSINESS,
  name: "Buji",
  ...over,
});

beforeEach(async () => {
  await db.sync_queue.clear();
});

describe("enqueue — birleştirme", () => {
  it("ilk değişiklik yeni kuyruk kaydı açar", async () => {
    await enqueue("products", ID, "INSERT", rec(), DEVICE);
    const all = await db.sync_queue.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ operation: "INSERT", status: "PENDING" });
  });

  it("bekleyen INSERT + UPDATE → tek INSERT, son hâliyle", async () => {
    await enqueue("products", ID, "INSERT", rec(), DEVICE);
    await enqueue("products", ID, "UPDATE", rec({ name: "Buji NGK", version: 1 }), DEVICE);

    const all = await db.sync_queue.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].operation).toBe("INSERT");
    expect(all[0].payload.name).toBe("Buji NGK");
  });

  it("bekleyen INSERT + DELETE → kuyruk boşalır (sunucu kaydı hiç görmedi)", async () => {
    await enqueue("products", ID, "INSERT", rec(), DEVICE);
    await enqueue("products", ID, "DELETE", rec(), DEVICE);
    expect(await db.sync_queue.count()).toBe(0);
  });

  it("bekleyen UPDATE + UPDATE → tek UPDATE, ilk düzenlemenin version değeriyle", async () => {
    await enqueue("products", ID, "UPDATE", rec({ name: "A", version: 3 }), DEVICE);
    await enqueue("products", ID, "UPDATE", rec({ name: "B", version: 3 }), DEVICE);
    await enqueue("products", ID, "UPDATE", rec({ name: "C", version: 9 }), DEVICE);

    const all = await db.sync_queue.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].payload).toMatchObject({ name: "C", version: 3 });
  });

  it("bekleyen UPDATE + DELETE → DELETE", async () => {
    await enqueue("products", ID, "UPDATE", rec({ version: 1 }), DEVICE);
    await enqueue("products", ID, "DELETE", rec(), DEVICE);
    const all = await db.sync_queue.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].operation).toBe("DELETE");
  });

  it("farklı kayıt ve farklı tablo birleştirilmez", async () => {
    await enqueue("products", ID, "UPDATE", rec({ version: 1 }), DEVICE);
    await enqueue("customers", ID, "UPDATE", rec({ version: 1 }), DEVICE);
    await enqueue("products", "baska-id", "UPDATE", rec({ id: "baska-id", version: 1 }), DEVICE);
    expect(await db.sync_queue.count()).toBe(3);
  });

  it("gönderilmiş (SYNCED) kayıtla birleşmez, yeni kayıt açılır", async () => {
    await enqueue("products", ID, "UPDATE", rec({ version: 1 }), DEVICE);
    const [first] = await db.sync_queue.toArray();
    await db.sync_queue.update(first.id, { status: "SYNCED" });

    await enqueue("products", ID, "UPDATE", rec({ version: 2 }), DEVICE);
    expect(await db.sync_queue.count()).toBe(2);
  });
});

describe("markError / markConflict", () => {
  it("5. başarısız denemede ERROR olur, kayıt silinmez (AC-037)", async () => {
    await enqueue("products", ID, "INSERT", rec(), DEVICE);
    const [item] = await db.sync_queue.toArray();
    for (let i = 0; i < 5; i++) await markError(item.id, "ağ hatası");

    const after = await db.sync_queue.get(item.id);
    expect(after).toMatchObject({ status: "ERROR", retry_count: 5, error_message: "ağ hatası" });
  });

  it("çakışma mesajıyla CONFLICT olur", async () => {
    await enqueue("products", ID, "UPDATE", rec({ version: 1 }), DEVICE);
    const [item] = await db.sync_queue.toArray();
    await markConflict(item.id, "sürüm farkı");
    expect(await db.sync_queue.get(item.id)).toMatchObject({
      status: "CONFLICT",
      error_message: "sürüm farkı",
    });
  });
});
