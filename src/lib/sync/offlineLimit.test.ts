import { afterEach, describe, expect, it } from "vitest";
import {
  OfflineLimitError,
  assertWriteAllowed,
  configureOfflineLimit,
  daysSinceSync,
  offlineLimitExceeded,
} from "./offlineLimit";

const NOW = new Date("2026-10-31T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

afterEach(() => configureOfflineLimit(null));

describe("çevrimdışı azami gün (AC-045)", () => {
  it("son eşitlemeden geçen gün hesaplanır; hiç eşitlenmemişse sınır yok", () => {
    expect(daysSinceSync(daysAgo(10), NOW)).toBe(10);
    expect(daysSinceSync(null, NOW)).toBeNull();
    expect(daysSinceSync("bozuk", NOW)).toBeNull();
    expect(offlineLimitExceeded(null, 30, NOW)).toBe(false);
  });

  it("sınır günü dahil izinli, aşılınca engelli", () => {
    expect(offlineLimitExceeded(daysAgo(30), 30, NOW)).toBe(false);
    expect(offlineLimitExceeded(daysAgo(31), 30, NOW)).toBe(true);
    expect(offlineLimitExceeded(daysAgo(8), 7, NOW)).toBe(true);
  });

  it("süre aşılmış ve çevrimdışıysa yazma engellenir; çevrimiçiyken veya sınır içindeyken izinli", () => {
    let online = false;
    let last: string | null = daysAgo(45);
    configureOfflineLimit({ getLastSyncedAt: () => last, getMaxDays: () => 30, getIsOnline: () => online });
    expect(() => assertWriteAllowed(NOW)).toThrow(OfflineLimitError);
    online = true;
    expect(() => assertWriteAllowed(NOW)).not.toThrow();
    online = false;
    last = daysAgo(5);
    expect(() => assertWriteAllowed(NOW)).not.toThrow();
  });

  it("ayar yoksa varsayılan 30 gün uygulanır; kurulmamışsa sınır yok", () => {
    expect(() => assertWriteAllowed(NOW)).not.toThrow();
    configureOfflineLimit({ getLastSyncedAt: () => daysAgo(31), getMaxDays: () => undefined, getIsOnline: () => false });
    expect(() => assertWriteAllowed(NOW)).toThrow(/31 gündür/);
  });
});
