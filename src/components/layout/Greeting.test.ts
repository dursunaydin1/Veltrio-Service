import { describe, expect, it } from "vitest";
import { dayNote } from "./Greeting";

const base = { active: 0, upcoming: 0, overdue: 0, waitingApproval: 0 };

describe("günün özeti cümlesi", () => {
  it("önceliğe göre tek cümle seçer: gecikme > onay > yaklaşan > açık > boş", () => {
    expect(dayNote({ ...base, active: 5, overdue: 1, upcoming: 2, waitingApproval: 1 })).toMatch(/Gecikmiş/);
    expect(dayNote({ ...base, active: 5, upcoming: 2, waitingApproval: 1 })).toMatch(/onayı/);
    expect(dayNote({ ...base, active: 5, upcoming: 2 })).toMatch(/Yaklaşan/);
    expect(dayNote({ ...base, active: 5 })).toBe("Her şey yolunda, gecikme yok.");
    expect(dayNote(base)).toBe("Atölye boş, yeni işlere hazır.");
  });

  it("veri gelmeden yükleniyor der", () => {
    expect(dayNote(undefined)).toBe("Kayıtlar yükleniyor…");
  });
});
