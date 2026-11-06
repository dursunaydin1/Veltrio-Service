"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Uygulama içi onay penceresi (K-095): tarayıcının sade `confirm()` kutusu yerine ekranın ortasında modal.
 * Açıkken arkadaki ekran kilitlidir (yerel `<dialog>` + `showModal`); karar verilmeden başka yere dokunulamaz.
 *
 *   if (await confirmDialog({ title: "Çıkış yapılsın mı?", confirmLabel: "Çıkış yap", danger: true })) …
 */
type Request = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
};

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function confirmDialog(options: Omit<Request, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    current?.resolve(false);
    current = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const request = current;
  current = null;
  emit();
  request?.resolve(ok);
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
        settle(false);
      }}
    >
      {request ? (
        <div className="stack stack-md">
          <h2 id="confirm-title">{request.title}</h2>
          {request.message ? <p>{request.message}</p> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => settle(false)} autoFocus>
              {request.cancelLabel ?? "Vazgeç"}
            </button>
            <button type="button" className={`btn ${request.danger ? "btn-danger" : "btn-primary"}`} style={{ flex: 1 }} onClick={() => settle(true)}>
              {request.confirmLabel ?? "Evet"}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
