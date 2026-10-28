import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { shouldRepullEverything } from "./client";

const BUSINESS = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-000000000002";

beforeEach(async () => {
  await Promise.all([db.customers.clear(), db.services.clear(), db.products.clear()]);
});

describe("kendini onaran eşitleme", () => {
  it("ilk eşitlemede (imleç 0) zaten her şey iner; ek işlem gerekmez", async () => {
    expect(await shouldRepullEverything(BUSINESS, "0")).toBe(false);
  });

  it("imleç ilerlemiş ama cihazda bu işletmenin kaydı yoksa her şey baştan indirilir", async () => {
    await db.customers.put({ id: "c1", business_id: OTHER, name: "Başka işletme" } as never);
    expect(await shouldRepullEverything(BUSINESS, "2032")).toBe(true);
  });

  it("yerel kayıt varsa normal (artımlı) eşitleme sürer", async () => {
    await db.customers.put({ id: "c2", business_id: BUSINESS, name: "Ali" } as never);
    expect(await shouldRepullEverything(BUSINESS, "2032")).toBe(false);
  });
});
