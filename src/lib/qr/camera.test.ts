import { describe, expect, it } from "vitest";
import { cameraErrorMessage } from "./camera";

describe("cameraErrorMessage", () => {
  it("izin reddini ayırt eder (Error ve düz metin)", () => {
    const denied = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    expect(cameraErrorMessage(denied)).toMatch(/izni verilmemiş/);
    expect(cameraErrorMessage("NotAllowedError: Permission denied")).toMatch(/izni verilmemiş/);
  });

  it("kamera yok / meşgul / güvensiz adres", () => {
    expect(cameraErrorMessage("NotFoundError: Requested device not found")).toMatch(/bulunamadı/);
    expect(cameraErrorMessage("NotReadableError: Could not start video source")).toMatch(/başka bir uygulama/);
    expect(cameraErrorMessage(Object.assign(new Error("x"), { name: "SecurityError" }))).toMatch(/https/);
  });

  it("bilinmeyen hatada genel ileti", () => {
    expect(cameraErrorMessage(new Error("boom"))).toMatch(/Tekrar dene/);
  });
});
