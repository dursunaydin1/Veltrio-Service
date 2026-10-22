import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseCustomerForm, type CustomerFormInput } from "./schema";
import {
  CustomerHasOpenServiceError,
  CustomerNotFoundError,
  DuplicatePhoneError,
  createCustomer,
  findCustomersByPhone,
  setCustomerArchived,
  updateCustomer,
} from "./service";

const ctx = { businessId: "00000000-0000-0000-0000-000000000001", deviceCode: "DEMO-AB23", actorId: "u1" };

const form = (over: Partial<CustomerFormInput> = {}): CustomerFormInput => ({
  name: "Ali Yılmaz",
  phone: "0532 123 45 67",
  noPhone: false,
  village: "Çamlıca",
  address: "",
  notes: "",
  ...over,
});

function fieldsOf(over: Partial<CustomerFormInput> = {}) {
  const r = parseCustomerForm(form(over));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.fields;
}

beforeEach(async () => {
  await db.customers.clear();
  await db.services.clear();
  await db.sync_queue.clear();
  await db.audit_logs.clear();
});

describe("parseCustomerForm", () => {
  it("telefonu normalize eder", () => {
    expect(fieldsOf()).toMatchObject({
      name: "Ali Yılmaz",
      phone: "0532 123 45 67",
      phone_normalized: "5321234567",
      no_phone_flag: false,
      village: "Çamlıca",
      address: undefined,
    });
  });

  it("telefon zorunlu; 'telefonu yok' işaretliyse boş olabilir", () => {
    const missing = parseCustomerForm(form({ phone: "" }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.phone).toBeTruthy();

    const none = fieldsOf({ phone: "", noPhone: true });
    expect(none).toMatchObject({ no_phone_flag: true, phone: undefined, phone_normalized: undefined });
  });

  it("'telefonu yok' işaretliyken yazılmış numara kaydedilmez", () => {
    expect(fieldsOf({ phone: "0532 123 45 67", noPhone: true }).phone).toBeUndefined();
  });

  it("geçersiz telefon, boş ad ve boş köy reddedilir", () => {
    const r = parseCustomerForm(form({ name: " ", phone: "123", village: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["name", "phone", "village"]);
  });
});

describe("müşteri servisi", () => {
  it("müşteri oluşturur: yerelde kayıt + kuyrukta INSERT", async () => {
    const c = await createCustomer(ctx, fieldsOf());
    expect(await db.customers.get(c.id)).toMatchObject({ name: "Ali Yılmaz", phone_normalized: "5321234567" });

    const [q] = await db.sync_queue.toArray();
    expect(q).toMatchObject({ table_name: "customers", record_id: c.id, operation: "INSERT" });
    expect(q.payload).toMatchObject({ business_id: ctx.businessId, village: "Çamlıca", address: null });
  });

  it("aynı telefonu farklı yazımla ikinci kez kaydetmeyi uyarır (AC-029)", async () => {
    const first = await createCustomer(ctx, fieldsOf());
    const err = await createCustomer(ctx, fieldsOf({ name: "Başka Ali", phone: "+90 (532) 123-45-67" })).catch((e) => e);

    expect(err).toBeInstanceOf(DuplicatePhoneError);
    expect(err.existing.id).toBe(first.id);
    expect(await db.customers.count()).toBe(1);
  });

  it("kullanıcı bilinçli olarak yeni kayıt açabilir", async () => {
    await createCustomer(ctx, fieldsOf());
    await createCustomer(ctx, fieldsOf({ name: "Başka Ali" }), { allowDuplicatePhone: true });
    expect(await db.customers.count()).toBe(2);
    expect(await findCustomersByPhone(ctx.businessId, "5321234567")).toHaveLength(2);
  });

  it("telefonsuz müşteriler mükerrer sayılmaz", async () => {
    await createCustomer(ctx, fieldsOf({ phone: "", noPhone: true }));
    await createCustomer(ctx, fieldsOf({ name: "Veli", phone: "", noPhone: true }));
    expect(await db.customers.count()).toBe(2);
  });

  it("başka işletmenin aynı numarası uyarı vermez", async () => {
    await createCustomer({ ...ctx, businessId: "baska-isletme" }, fieldsOf());
    await expect(createCustomer(ctx, fieldsOf())).resolves.toBeTruthy();
  });

  it("güncelleme: telefon değişince mükerrer kontrolü, kendi numarasını korumak serbest", async () => {
    await createCustomer(ctx, fieldsOf({ phone: "0532 111 11 11" }));
    const b = await createCustomer(ctx, fieldsOf({ name: "Veli", phone: "0533 222 22 22" }));

    await expect(updateCustomer(ctx, b.id, fieldsOf({ name: "Veli", phone: "0532 111 11 11" }))).rejects.toBeInstanceOf(DuplicatePhoneError);
    await expect(updateCustomer(ctx, b.id, fieldsOf({ name: "Veli K.", phone: "0533 222 22 22" }))).resolves.toBeTruthy();
  });

  it("henüz gönderilmemiş müşteriyi güncellemek INSERT paketini günceller; içerik aynıysa hiçbir şey yazılmaz", async () => {
    const c = await createCustomer(ctx, fieldsOf());
    await updateCustomer(ctx, c.id, fieldsOf({ village: "Yeni Köy" }));
    let queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ operation: "INSERT" });
    expect(queue[0].payload.village).toBe("Yeni Köy");

    await db.sync_queue.clear();
    await updateCustomer(ctx, c.id, fieldsOf({ village: "Yeni Köy" }));
    queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(0);
  });

  it("eşitlenmiş müşteriyi güncellemek version ile UPDATE gönderir; telefon silinince null gider", async () => {
    const c = await createCustomer(ctx, fieldsOf());
    await db.sync_queue.clear();
    await db.customers.put({ ...c, version: 3 });

    await updateCustomer(ctx, c.id, fieldsOf({ phone: "", noPhone: true }));
    const [q] = await db.sync_queue.toArray();
    expect(q.payload).toMatchObject({ version: 3, phone: null, phone_normalized: null, no_phone_flag: true });
  });

  it("olmayan müşteri güncellenemez", async () => {
    await expect(updateCustomer(ctx, "yok", fieldsOf())).rejects.toBeInstanceOf(CustomerNotFoundError);
  });
});

describe("arşivleme (AC-030)", () => {
  const service = (customerId: string, status: string) => ({
    id: `s-${status}`,
    business_id: ctx.businessId,
    document_no: `S-${status}`,
    customer_id: customerId,
    status,
    deposit_amount: 0,
    labor_fee: 0,
    total_amount: 0,
    received_date: new Date().toISOString(),
    is_warranty_claim: false,
    created_by_device: "X",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it("açık servisi olan müşteri arşivlenemez", async () => {
    const c = await createCustomer(ctx, fieldsOf());
    await db.services.add(service(c.id, "IN_PROGRESS") as never);

    await expect(setCustomerArchived(ctx, c.id, true)).rejects.toBeInstanceOf(CustomerHasOpenServiceError);
    expect((await db.customers.get(c.id))?.archived_at).toBeUndefined();
  });

  it("servisleri teslim/iptal olmuş müşteri arşivlenir, audit log yazılır, geri açılabilir", async () => {
    const c = await createCustomer(ctx, fieldsOf());
    await db.services.add(service(c.id, "DELIVERED") as never);
    await db.sync_queue.clear();
    await db.customers.put({ ...c, version: 2 });

    const archived = await setCustomerArchived(ctx, c.id, true, "Taşındı");
    expect(archived.archived_at).toBeTruthy();
    expect(await db.audit_logs.toArray()).toHaveLength(1);

    // arşivli müşteri telefon aramasında çıkmaz (mükerrer uyarısı vermez)
    expect(await findCustomersByPhone(ctx.businessId, "5321234567")).toHaveLength(0);

    const restored = await setCustomerArchived(ctx, c.id, false);
    expect(restored.archived_at).toBeUndefined();
    const updates = (await db.sync_queue.toArray()).filter((q) => q.table_name === "customers");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ archived_at: null, version: 2 });
  });
});
