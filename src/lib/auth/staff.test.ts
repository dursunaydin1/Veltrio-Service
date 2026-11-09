import { describe, expect, it } from "vitest";
import { formatInviteCode, isInviteOpen, normalizeInviteCode } from "./staff";

describe("davet kodu (K-119)", () => {
  it("4-4 gösterilir, elle yazılan kod sadeleşir", () => {
    expect(formatInviteCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(normalizeInviteCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizeInviteCode("ab cd ef gh")).toBe("ABCDEFGH");
  });

  it("kullanılan, iptal edilen ya da süresi dolan davet açık değildir", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const base = { used_at: null, revoked_at: null, expires_at: "2026-11-16T12:00:00Z" };
    expect(isInviteOpen(base, now)).toBe(true);
    expect(isInviteOpen({ ...base, used_at: "2026-11-10T00:00:00Z" }, now)).toBe(false);
    expect(isInviteOpen({ ...base, revoked_at: "2026-11-10T00:00:00Z" }, now)).toBe(false);
    expect(isInviteOpen({ ...base, expires_at: "2026-11-08T00:00:00Z" }, now)).toBe(false);
  });
});
