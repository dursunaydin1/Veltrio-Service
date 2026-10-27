import { describe, expect, it } from "vitest";
import { resolveTheme, THEME_INIT_SCRIPT } from "./theme";

describe("tema", () => {
  it("açık seçim cihaz ayarından bağımsızdır", () => {
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("sistem seçimi cihaz ayarını izler", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });

  it("ilk betik depolama okunamazsa koyu temaya düşer", () => {
    const root = { dataset: {} as Record<string, string> };
    const run = new Function("document", "localStorage", "matchMedia", THEME_INIT_SCRIPT);
    run({ documentElement: root }, { getItem: () => { throw new Error("kapalı"); } }, () => ({ matches: true }));
    expect(root.dataset.theme).toBe("dark");
    run({ documentElement: root }, { getItem: () => "system" }, () => ({ matches: true }));
    expect(root.dataset.theme).toBe("light");
  });
});
