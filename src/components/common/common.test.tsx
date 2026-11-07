// @vitest-environment jsdom
import "@/test/dom";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuantityStepper } from "./QuantityStepper";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { ConfirmHost, confirmDialog, promptDialog } from "./ConfirmDialog";
import { OptionalField } from "./OptionalField";
import type { PaymentMethod } from "@/types";

function Stepper({ start = "1", min }: { start?: string; min?: number }) {
  const [v, setV] = useState(start);
  return <QuantityStepper label="Miktar" value={v} onChange={setV} min={min} />;
}

describe("QuantityStepper (ekran)", () => {
  it("+ ve − miktarı birer değiştirir, en az değerin altına inmez", async () => {
    const user = userEvent.setup();
    render(<Stepper />);
    const box = screen.getByLabelText("Miktar") as HTMLInputElement;
    await user.click(screen.getByRole("button", { name: "Miktar: artır" }));
    await user.click(screen.getByRole("button", { name: "Miktar: artır" }));
    expect(box.value).toBe("3");
    await user.click(screen.getByRole("button", { name: "Miktar: azalt" }));
    await user.click(screen.getByRole("button", { name: "Miktar: azalt" }));
    await user.click(screen.getByRole("button", { name: "Miktar: azalt" }));
    expect(box.value).toBe("1");
  });

  it("kesirli miktar elle yazılabilir", async () => {
    const user = userEvent.setup();
    render(<Stepper />);
    const box = screen.getByLabelText("Miktar") as HTMLInputElement;
    await user.clear(box);
    await user.type(box, "1,5");
    await user.click(screen.getByRole("button", { name: "Miktar: artır" }));
    expect(box.value).toBe("2,5");
  });
});

describe("PaymentMethodPicker (ekran)", () => {
  it("seçili yöntem işaretli görünür, dokununca değişir", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PaymentMethodPicker<PaymentMethod> value="CASH" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Nakit" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Kart" }));
    expect(onChange).toHaveBeenCalledWith("CARD");
  });

  it("ek seçenekler yöntemlerden önce gelir (iade: alacağa yaz)", () => {
    render(
      <PaymentMethodPicker<PaymentMethod | "CUSTOMER_CREDIT">
        value="CUSTOMER_CREDIT"
        onChange={() => undefined}
        label="Para iadesi"
        extra={[{ value: "CUSTOMER_CREDIT", label: "Alacağa yaz" }]}
      />
    );
    const chips = screen.getAllByRole("button");
    expect(chips[0].textContent).toBe("Alacağa yaz");
    expect(screen.getByRole("group", { name: "Para iadesi" })).toBeTruthy();
  });
});

describe("Onay ve metin penceresi (ekran)", () => {
  it("onay: Evet true, Vazgeç false döner", async () => {
    const user = userEvent.setup();
    render(<ConfirmHost />);
    let answer: Promise<boolean>;
    act(() => {
      answer = confirmDialog({ title: "Çıkış yapılsın mı?", confirmLabel: "Çıkış yap" });
    });
    await user.click(await screen.findByRole("button", { name: "Çıkış yap" }));
    await expect(answer!).resolves.toBe(true);

    act(() => {
      answer = confirmDialog({ title: "Silinsin mi?" });
    });
    await user.click(await screen.findByRole("button", { name: "Vazgeç" }));
    await expect(answer!).resolves.toBe(false);
  });

  it("zorunlu metin boşken onaylanamaz; girilen metin kırpılmış döner", async () => {
    const user = userEvent.setup();
    render(<ConfirmHost />);
    let answer: Promise<string | null>;
    act(() => {
      answer = promptDialog({ title: "Geri alınsın mı?", inputLabel: "Neden", confirmLabel: "Geri al" });
    });
    const confirm = (await screen.findByRole("button", { name: "Geri al" })) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText("Neden"), "  yanlış parça  ");
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await expect(answer!).resolves.toBe("yanlış parça");
  });
});

describe("OptionalField (ekran)", () => {
  function Field() {
    const [note, setNote] = useState("");
    return (
      <OptionalField label="Not" htmlFor="n" filled={!!note} onClear={() => setNote("")}>
        <input id="n" value={note} onChange={(e) => setNote(e.target.value)} />
      </OptionalField>
    );
  }

  it("kapalıyken çip görünür; dokununca alan açılır, X ile kapanır ve silinir", async () => {
    const user = userEvent.setup();
    render(<Field />);
    await user.click(screen.getByRole("button", { name: /Not/ }));
    const input = screen.getByLabelText("Not") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    await user.type(input, "Acil");
    await user.click(screen.getByRole("button", { name: "Not: kaldır" }));
    expect(screen.queryByLabelText("Not")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Not/ }));
    expect((screen.getByLabelText("Not") as HTMLInputElement).value).toBe("");
  });
});
