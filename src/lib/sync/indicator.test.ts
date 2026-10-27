import { describe, expect, it } from "vitest";
import { syncIndicatorTone } from "./indicator";

describe("eşitleme göstergesi", () => {
  const base = { isOnline: true, problems: 0, pending: 0, pendingLong: false };

  it("her şey yolundayken ve kısa bekleyişte görünmez", () => {
    expect(syncIndicatorTone(base)).toBe("hidden");
    expect(syncIndicatorTone({ ...base, pending: 1 })).toBe("hidden");
  });

  it("uzun süren bekleyiş, sorun ve çevrimdışı her zaman görünür", () => {
    expect(syncIndicatorTone({ ...base, pending: 1, pendingLong: true })).toBe("pending");
    expect(syncIndicatorTone({ ...base, problems: 2 })).toBe("problem");
    expect(syncIndicatorTone({ ...base, isOnline: false })).toBe("offline");
    // Çevrimdışılık sorundan önce gelir (önce bağlantı gerekir)
    expect(syncIndicatorTone({ ...base, isOnline: false, problems: 1 })).toBe("offline");
  });
});
