import { describe, expect, it } from "vitest";
import { machineTitle, matchesMachine } from "./MachineList";
import type { Machine } from "@/types";

const m = (over: Partial<Machine> = {}): Machine => ({
  id: "1",
  business_id: "b",
  type: "Zincirli testere",
  brand: "Stihl",
  model: "MS 180",
  serial_number: "SN-1001",
  internal_number: "MK-DEMO-AB23-00001",
  is_temporary: false,
  created_at: "",
  updated_at: "",
  ...over,
});

describe("matchesMachine", () => {
  it("marka, model, seri no, iç numara, tür ve sahip adıyla bulunur", () => {
    const machine = m();
    for (const q of ["stihl", "ms 180", "sn-1001", "mk-demo-ab23-00001", "testere", "çamlıca ali"]) {
      expect(matchesMachine(machine, "Ali Çamlıca", q)).toBe(true);
    }
  });

  it("Türkçe karakter ve büyük harften bağımsızdır; kelimelerin hepsi eşleşmeli", () => {
    expect(matchesMachine(m(), "Şükrü", "SUKRU stihl")).toBe(true);
    expect(matchesMachine(m(), "Şükrü", "sukru husqvarna")).toBe(false);
  });

  it("boş arama hepsini getirir", () => {
    expect(matchesMachine(m(), "", "  ")).toBe(true);
  });
});

describe("machineTitle", () => {
  it("marka + model; yoksa tür", () => {
    expect(machineTitle(m())).toBe("Stihl MS 180");
    expect(machineTitle(m({ brand: undefined, model: undefined }))).toBe("Zincirli testere");
  });
});
