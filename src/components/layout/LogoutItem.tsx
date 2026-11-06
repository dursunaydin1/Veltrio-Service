"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import { confirmDialog } from "@/components/common/ConfirmDialog";

/** Menü'deki "Çıkış yap" (K-094, K-095): ekranın ortasında onay penceresi; karar verilmeden devam edilmez. */
export function LogoutItem() {
  async function logout() {
    const ok = await confirmDialog({
      title: "Çıkış yapılsın mı?",
      message: "Bu telefondaki kayıtlar silinmez; tekrar girişte şifre sorulur.",
      confirmLabel: "Çıkış yap",
      danger: true,
    });
    if (ok) await logoutAction();
  }

  return (
    <li>
      <button type="button" style={{ color: "var(--danger-fg)" }} onClick={() => void logout()}>
        <span className="avatar avatar-sm menu-avatar" aria-hidden="true">
          <LogOut size={18} />
        </span>
        Çıkış yap
      </button>
    </li>
  );
}
