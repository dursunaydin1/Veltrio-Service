import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STAFF_PERMISSIONS, can, canOpenRoute, isOwner, routeRequirement } from "./permissions";

const owner = { role: "owner" as const, is_active: true, permissions: [] };
const staff = { role: "staff" as const, is_active: true, permissions: ["credit_sale"] };

describe("can (patron / çalışan yetkisi, K-119)", () => {
  it("patron her şeyi yapar", () => {
    for (const p of STAFF_PERMISSIONS) expect(can(owner, p)).toBe(true);
    expect(isOwner(owner)).toBe(true);
  });

  it("çalışan yalnızca verilen izni kullanır", () => {
    expect(can(staff, "credit_sale")).toBe(true);
    expect(can(staff, "cancel")).toBe(false);
    expect(can(staff, "view_costs")).toBe(false);
    expect(isOwner(staff)).toBe(false);
  });

  it("pasif kullanıcı hiçbir şey yapamaz", () => {
    expect(can({ ...staff, is_active: false }, "credit_sale")).toBe(false);
    expect(can({ ...owner, is_active: false }, "reports")).toBe(false);
    expect(isOwner({ ...owner, is_active: false })).toBe(false);
  });

  it("028'den önceki kullanıcı kaydı (alanlar yok) patron olarak çalışmaya devam eder", () => {
    expect(can({ role: "owner" }, "reports")).toBe(true);
    expect(can({ role: "staff" }, "reports")).toBe(false);
  });
});

describe("routeRequirement / canOpenRoute", () => {
  it("en uzun eşleşen önek kazanır", () => {
    expect(routeRequirement("/settings")).toBe("owner");
    expect(routeRequirement("/settings/backup")).toBe("owner");
    expect(routeRequirement("/settings/appearance")).toBeNull();
    expect(routeRequirement("/settings/pin")).toBeNull();
    expect(routeRequirement("/purchases/abc")).toBe("purchases");
    expect(routeRequirement("/products/new")).toBe("products");
    expect(routeRequirement("/products/abc")).toBeNull();
    expect(routeRequirement("/sales/new")).toBeNull();
  });

  it("önek kelime sınırında eşleşir", () => {
    expect(routeRequirement("/reportsx")).toBeNull();
  });

  it("çalışan yalnızca izinli bölümlere girer", () => {
    expect(canOpenRoute(staff, "/sales")).toBe(true);
    expect(canOpenRoute(staff, "/settings/appearance")).toBe(true);
    expect(canOpenRoute(staff, "/settings/devices")).toBe(false);
    expect(canOpenRoute(staff, "/reports")).toBe(false);
    expect(canOpenRoute({ ...staff, permissions: ["reports"] }, "/reports")).toBe(true);
    expect(canOpenRoute(owner, "/settings/backup")).toBe(true);
  });
});

describe("izin listesi veritabanıyla aynı", () => {
  it("028 migration'daki valid_staff_permissions ile birebir eşleşir", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/028_staff_roles.sql"), "utf8");
    const block = sql.match(/valid_staff_permissions\(p TEXT\[\][\s\S]*?ARRAY\[([\s\S]*?)\]::TEXT\[\]/);
    expect(block).not.toBeNull();
    const inSql = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...STAFF_PERMISSIONS].sort());
  });
});
