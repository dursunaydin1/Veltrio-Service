import { describe, expect, it } from "vitest";
import { homeRoute, initialNav, nextNav } from "./history";

describe("gezinme yığını", () => {
  it("ana sayfadan başlar, ileri gidildikçe derinleşir, geri gelince azalır", () => {
    let s = initialNav("/dashboard");
    expect(s).toEqual({ depth: 0, rootIsHome: true });
    s = nextNav(s, "push"); // Servisler
    s = nextNav(s, "push"); // servis detayı
    expect(s.depth).toBe(2);
    s = nextNav(s, "pop");
    expect(s.depth).toBe(1);
    s = nextNav(nextNav(s, "pop"), "pop");
    expect(s.depth).toBe(0);
  });

  it("form kaydedilince yerine geçen sayfa derinliği değiştirmez", () => {
    const s = nextNav(nextNav(initialNav("/dashboard"), "push"), "replace");
    expect(s.depth).toBe(1);
  });

  it("ana sayfaya dönüş: geçmişte geri gidilir; ana sayfadan başlamadıysa yerine konur", () => {
    const deep = nextNav(nextNav(initialNav("/dashboard"), "push"), "push");
    expect(homeRoute(deep)).toEqual({ go: -2 });
    expect(homeRoute(initialNav("/scan"))).toEqual({ replace: true });
    expect(nextNav(deep, "home")).toEqual({ depth: 0, rootIsHome: true });
  });
});
