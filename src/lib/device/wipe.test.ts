import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isRevoked } from "./devices";
import { isAppStorageKey, wipeLocalData } from "./wipe";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.get(k) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe("iptal edilen cihazda yerel veri silme (AC-045)", () => {
  it("yerel veritabanı ve uygulamaya ait anahtarlar silinir; başka anahtarlara dokunulmaz", async () => {
    await db.open();
    await db.customers.add({
      id: "c1", business_id: "b1", name: "Ali", created_at: "x", updated_at: "x",
    } as never);
    await db.sync_queue.add({ id: "q1", table_name: "customers", record_id: "c1", operation: "INSERT", payload: {}, device_code: "D", status: "PENDING", retry_count: 0, created_at: "x" } as never);

    const storage = new MemoryStorage();
    storage.setItem("veltrio-session", "{}");
    storage.setItem("veltrio_device_code", "DEMO-AB23");
    storage.setItem("veltrio_sync_cursor:b1:DEMO-AB23", "42");
    storage.setItem("baska-uygulama", "kalsin");

    await wipeLocalData(storage);

    expect(storage.getItem("veltrio-session")).toBeNull();
    expect(storage.getItem("veltrio_device_code")).toBeNull();
    expect(storage.getItem("veltrio_sync_cursor:b1:DEMO-AB23")).toBeNull();
    expect(storage.getItem("baska-uygulama")).toBe("kalsin");

    // Veritabanı yeniden açılınca boş gelir
    await db.open();
    expect(await db.customers.count()).toBe(0);
    expect(await db.sync_queue.count()).toBe(0);
  });

  it("anahtar adı ve iptal durumu ayrımı", () => {
    expect(isAppStorageKey("veltrio_pin")).toBe(true);
    expect(isAppStorageKey("theme")).toBe(false);
    expect(isRevoked({ is_active: true, revoked_at: undefined })).toBe(false);
    expect(isRevoked({ is_active: false, revoked_at: undefined })).toBe(true);
    expect(isRevoked({ is_active: true, revoked_at: "2026-01-01T00:00:00Z" })).toBe(true);
  });
});
