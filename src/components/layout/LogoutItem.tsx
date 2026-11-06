"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";

/** Menü'deki "Çıkış yap" (K-094): önce onay sorulur; yanlışlıkla dokununca oturum kapanmaz. */
export function LogoutItem() {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <li>
        <button type="button" style={{ color: "var(--danger-fg)" }} onClick={() => setAsking(true)}>
          <span className="avatar avatar-sm menu-avatar" aria-hidden="true">
            <LogOut size={18} />
          </span>
          Çıkış yap
        </button>
      </li>
    );
  }
  return (
    <li className="confirm-row" role="alertdialog" aria-labelledby="logout-q">
      <span id="logout-q">
        <strong>Çıkış yapılsın mı?</strong>
        <small>Bu telefondaki kayıtlar silinmez; tekrar girişte şifre sorulur.</small>
      </span>
      <form action={logoutAction} className="row row-gap-sm">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsking(false)} autoFocus>
          Vazgeç
        </button>
        <button type="submit" className="btn btn-danger btn-sm">
          Çıkış yap
        </button>
      </form>
    </li>
  );
}
