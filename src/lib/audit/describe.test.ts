import { describe, expect, it } from "vitest";
import { describeChange, entityHref } from "./describe";

describe("audit log gösterimi (AC-032)", () => {
  it("eski → yeni değerleri okunur satırlara çevirir", () => {
    expect(
      describeChange({ old_value: { status: "FINAL", note: "a" }, new_value: { status: "CANCELLED", note: "a" } })
    ).toEqual(["Durum: FINAL → CANCELLED"]);
  });

  it("yalnızca yeni (oluşturma) veya yalnızca eski (silme) değerleri gösterir", () => {
    expect(describeChange({ old_value: undefined, new_value: { total_amount: 150 } })).toEqual(["Toplam: 150"]);
    expect(describeChange({ old_value: { stock_available: 4 }, new_value: undefined })).toEqual(["Satılabilir stok: 4 → —"]);
  });

  it("nesne değerleri JSON olarak, boş değerler tire olarak yazılır", () => {
    expect(describeChange({ old_value: { archived_at: null }, new_value: { archived_at: "2026-01-01" } })).toEqual([
      "Arşiv tarihi: — → 2026-01-01",
    ]);
  });

  it("kayıt türüne göre ilgili sayfaya bağlanır; bilinmeyen türde bağlantı yok", () => {
    expect(entityHref({ entity_type: "services", entity_id: "abc" })).toBe("/services/abc");
    expect(entityHref({ entity_type: "devices", entity_id: "abc" })).toBeNull();
  });
});
