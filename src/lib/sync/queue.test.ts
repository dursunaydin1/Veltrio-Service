import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { enqueue, getPendingItems, markConflict, markError } from "./queue";

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

  it("bekleyen INSERT + eksik sütunlu UPDATE → INSERT'in belge no/oluşturma bilgisi korunur", async () => {
    await enqueue("sales", ID, "INSERT", rec({ document_no: "S-1", created_by_device: DEVICE, created_at: "x" }), DEVICE);
    await enqueue("sales", ID, "UPDATE", { id: ID, business_id: BUSINESS, status: "FINAL", version: 1 }, DEVICE);

    const all = await db.sync_queue.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].payload).toMatchObject({ document_no: "S-1", created_by_device: DEVICE, status: "FINAL" });
    expect(all[0].payload.version).toBeUndefined();
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

describe("getPendingItems — bağımlılık sırası", () => {
  it("üst kayıtlar alt kayıtlardan önce gider, aynı tabloda eskiden yeniye", async () => {
    // Çocuk kayıtlar önce kuyruğa girmiş olsa bile
    await enqueue("service_status_history", "h1", "INSERT", { id: "h1", business_id: BUSINESS }, DEVICE);
    await enqueue("service_parts", "p1", "INSERT", { id: "p1", business_id: BUSINESS }, DEVICE);
    await enqueue("services", "s1", "INSERT", { id: "s1", business_id: BUSINESS }, DEVICE);
    await enqueue("customers", "c1", "INSERT", { id: "c1", business_id: BUSINESS }, DEVICE);
    await enqueue("customers", "c2", "INSERT", { id: "c2", business_id: BUSINESS }, DEVICE);
    await enqueue("audit_logs", "a1", "INSERT", { id: "a1", business_id: BUSINESS }, DEVICE);

    // Aynı milisaniyede eklenen aynı tablo kayıtlarının kendi aralarındaki sırası
    // belirsizdir; bu yüzden tablo sırası doğrulanır.
    const order = (await getPendingItems()).map((i) => i.table_name);
    expect(order).toEqual(["customers", "customers", "services", "service_parts", "service_status_history", "audit_logs"]);
  });

  it("bilinmeyen tablo en sona kalır; gönderilmiş kayıtlar dönmez", async () => {
    await enqueue("zzz_unknown", "u1", "INSERT", { id: "u1", business_id: BUSINESS }, DEVICE);
    await enqueue("customers", "c1", "INSERT", { id: "c1", business_id: BUSINESS }, DEVICE);
    const [sent] = await db.sync_queue.where("record_id").equals("c1").toArray();
    await db.sync_queue.update(sent.id, { status: "SYNCED" });
    await enqueue("machines", "m1", "INSERT", { id: "m1", business_id: BUSINESS }, DEVICE);

    expect((await getPendingItems()).map((i) => i.record_id)).toEqual(["m1", "u1"]);
  });
});
