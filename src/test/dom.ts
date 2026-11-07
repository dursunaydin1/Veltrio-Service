/**
 * Ekran testleri için ortak hazırlık (K-117): her testten sonra çizilenler temizlenir;
 * jsdom'da olmayan `<dialog>` yöntemleri basitçe taklit edilir.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}
