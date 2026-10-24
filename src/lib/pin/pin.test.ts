import { beforeEach, describe, expect, it } from "vitest";
import { attemptUnlock, hasPin, lockDurationMs, removePin, setPin, validatePinFormat } from "./pin";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.get(k) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

const FAST = 1000; // test için düşük yineleme
let storage: MemoryStorage;
const NOW = 1_000_000;

beforeEach(async () => {
  storage = new MemoryStorage();
  await setPin(storage, "4821", FAST);
});

describe("PIN biçimi", () => {
  it("4-8 haneli, rakam; tekrar ve ardışık PIN reddedilir", () => {
    expect(validatePinFormat("4821")).toBeNull();
    expect(validatePinFormat("482")).toMatch(/haneli/);
    expect(validatePinFormat("123456789")).toMatch(/haneli/);
    expect(validatePinFormat("48a1")).toMatch(/rakam/);
    expect(validatePinFormat("1111")).toMatch(/tekrar/);
    expect(validatePinFormat("1234")).toMatch(/ardışık/);
    expect(validatePinFormat("8765")).toMatch(/ardışık/);
  });

  it("PIN düz metin saklanmaz", () => {
    const raw = storage.getItem("veltrio_pin") as string;
    expect(raw).not.toContain("4821");
    expect(JSON.parse(raw)).toMatchObject({ iterations: FAST });
  });
});

describe("kilit süreleri (AC-020)", () => {
  it("5. hatada 30 sn, sonra artan bekleme, üst sınır 60 dk", () => {
    expect([1, 2, 3, 4].map(lockDurationMs)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7, 8, 9, 10, 20].map(lockDurationMs)).toEqual([30_000, 60_000, 300_000, 900_000, 3_600_000, 3_600_000, 3_600_000]);
  });
});

describe("PIN ile kilit açma", () => {
  it("doğru PIN açar ve hata sayacını sıfırlar", async () => {
    await attemptUnlock(storage, "0000", NOW);
    await attemptUnlock(storage, "9999", NOW);
    expect(await attemptUnlock(storage, "4821", NOW)).toEqual({ ok: true });
    expect(storage.getItem("veltrio_pin_state")).toBeNull();
  });

  it("5 hatalı denemede kilitlenir; kilitliyken doğru PIN bile denenmez", async () => {
    let last = await attemptUnlock(storage, "0000", NOW);
    expect(last).toMatchObject({ reason: "WRONG", remainingAttempts: 4 });
    for (let i = 0; i < 4; i++) last = await attemptUnlock(storage, "0000", NOW);
    expect(last).toMatchObject({ reason: "WRONG", remainingAttempts: 0, lockedUntil: NOW + 30_000 });
    expect(await attemptUnlock(storage, "4821", NOW + 1000)).toEqual({ ok: false, reason: "LOCKED", lockedUntil: NOW + 30_000 });
  });

  it("süre dolunca denenebilir; yine hataysa bekleme artar (1 dk)", async () => {
    for (let i = 0; i < 5; i++) await attemptUnlock(storage, "0000", NOW);
    const later = NOW + 31_000;
    expect(await attemptUnlock(storage, "0000", later)).toMatchObject({ reason: "WRONG", lockedUntil: later + 60_000 });
    expect(await attemptUnlock(storage, "4821", later + 61_000)).toEqual({ ok: true });
  });

  it("hata sayacı kalıcıdır (sayfa yenileme sıfırlamaz)", async () => {
    for (let i = 0; i < 3; i++) await attemptUnlock(storage, "0000", NOW);
    expect(await attemptUnlock(storage, "0000", NOW)).toMatchObject({ remainingAttempts: 1 });
  });

  it("PIN kaldırılınca kilit yok; PIN yokken NO_PIN döner", async () => {
    expect(hasPin(storage)).toBe(true);
    removePin(storage);
    expect(hasPin(storage)).toBe(false);
    expect(await attemptUnlock(storage, "4821", NOW)).toEqual({ ok: false, reason: "NO_PIN" });
  });
});
