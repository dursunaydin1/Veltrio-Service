"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Uygulama içi onay penceresi (K-095): tarayıcının sade `confirm()` / `prompt()` kutusu yerine
 * ekranın ortasında modal. Açıkken arkadaki ekran kilitlidir (yerel `<dialog>` + `showModal`);
 * karar verilmeden başka yere dokunulamaz.
 *
 *   if (await confirmDialog({ title: "Çıkış yapılsın mı?", confirmLabel: "Çıkış yap", danger: true })) …
 *   const reason = await promptDialog({ title: "Neden?", inputLabel: "Neden" }); // vazgeçilirse null
 */
type Options = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Request = Options & {
  /** Metin kutusu istenirse (K-111) */
  input?: { label: string; placeholder?: string; required: boolean };
  resolve: (result: string | null) => void;
};

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function open(request: Omit<Request, "resolve">): Promise<string | null> {
  return new Promise((resolve) => {
    current?.resolve(null);
    current = { ...request, resolve };
    emit();
  });
}

/** Evet / hayır: onaylanırsa true. */
export async function confirmDialog(options: Options): Promise<boolean> {
  return (await open(options)) !== null;
}

/** Metin isteyen onay: girilen metin, vazgeçilirse null. `required` ise boş metinle onaylanamaz. */
export function promptDialog(
  options: Options & { inputLabel: string; placeholder?: string; required?: boolean }
): Promise<string | null> {
  const { inputLabel, placeholder, required = true, ...rest } = options;
  return open({ ...rest, input: { label: inputLabel, placeholder, required } });
}

function settle(result: string | null) {
  const request = current;
  current = null;
  emit();
  request?.resolve(result);
}

/** AppShell'de bir kez çizilir. */
export function ConfirmHost() {
  const request = useSyncExternalStore(subscribe, () => current, () => null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        // Geri tuşu / Esc: "Vazgeç" sayılır
        e.preventDefault();
        settle(null);
      }}
    >
      {/* Her istekte metin kutusu boş başlasın diye anahtar istekle değişir */}
      {request ? <DialogBody key={request.title + (request.message ?? "")} request={request} /> : null}
    </dialog>
  );
}

function DialogBody({ request }: { request: Request }) {
  const [text, setText] = useState("");
  const blocked = !!request.input?.required && !text.trim();
  const confirm = () => {
    if (blocked) return;
    settle(request.input ? text.trim() : "");
  };

  return (
    <form
      className="stack stack-md"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
    >
      <h2 id="confirm-title">{request.title}</h2>
      {request.message ? <p>{request.message}</p> : null}
      {request.input ? (
        <div className="form-group">
          <label className="form-label" htmlFor="confirm-input">{request.input.label}</label>
          <input
            id="confirm-input"
            className="form-input"
            placeholder={request.input.placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </div>
      ) : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => settle(null)} autoFocus={!request.input}>
          {request.cancelLabel ?? "Vazgeç"}
        </button>
        <button type="submit" className={`btn ${request.danger ? "btn-danger" : "btn-primary"}`} style={{ flex: 1 }} disabled={blocked}>
          {request.confirmLabel ?? "Evet"}
        </button>
      </div>
    </form>
  );
}
