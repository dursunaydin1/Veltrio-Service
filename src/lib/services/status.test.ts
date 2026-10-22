import { describe, expect, it } from "vitest";
import {
  SERVICE_STATUSES,
  SERVICE_TRANSITIONS,
  canTransition,
  isOpenStatus,
  isReopen,
  isServiceStatus,
  requiresReason,
  statusLabel,
} from "./status";

describe("durum makinesi (PRD §6.1)", () => {
  it("her durumun bir Türkçe etiketi ve geçiş tanımı vardır", () => {
    for (const s of SERVICE_STATUSES) {
      expect(statusLabel(s)).not.toBe(s);
      expect(SERVICE_TRANSITIONS[s]).toBeDefined();
    }
  });

  it.each([
    ["RECEIVED", "WAITING_DIAGNOSIS", true],
    ["RECEIVED", "DIAGNOSED", true],
    ["RECEIVED", "IN_PROGRESS", false],
    ["DIAGNOSED", "IN_PROGRESS", true],
    ["WAITING_CUSTOMER_APPROVAL", "DIAGNOSED", true],
    ["IN_PROGRESS", "COMPLETED", true],
    ["WAITING_PARTS", "COMPLETED", false],
    ["COMPLETED", "DELIVERED", true],
    ["COMPLETED", "IN_PROGRESS", true],
    ["DELIVERED", "IN_PROGRESS", true],
    ["DELIVERED", "COMPLETED", false],
  ] as const)("%s → %s: %s", (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it("teslim edilmiş servis iptal edilemez (AC-033); iptal edilen servis sonlanmıştır", () => {
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
    expect(SERVICE_TRANSITIONS.CANCELLED).toHaveLength(0);
  });

  it("kendi durumuna geçiş yoktur", () => {
    for (const s of SERVICE_STATUSES) expect(canTransition(s, s)).toBe(false);
  });

  it("iptal ve yeniden açma neden ister, diğer geçişler istemez", () => {
    expect(requiresReason("IN_PROGRESS", "CANCELLED")).toBe(true);
    expect(requiresReason("COMPLETED", "IN_PROGRESS")).toBe(true);
    expect(requiresReason("DELIVERED", "IN_PROGRESS")).toBe(true);
    expect(requiresReason("IN_PROGRESS", "WAITING_PARTS")).toBe(false);
    expect(isReopen("WAITING_PARTS", "IN_PROGRESS")).toBe(false);
  });

  it("açık servis: teslim edilmemiş ve iptal edilmemiş", () => {
    expect(isOpenStatus("IN_PROGRESS")).toBe(true);
    expect(isOpenStatus("COMPLETED")).toBe(true);
    expect(isOpenStatus("DELIVERED")).toBe(false);
    expect(isOpenStatus("CANCELLED")).toBe(false);
    expect(isServiceStatus("READY_FOR_DELIVERY")).toBe(false);
  });
});
