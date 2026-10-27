import type { ReactNode } from "react";
import { LogoMark } from "@/components/layout/Logo";

/** Giriş dışı hesap ekranları için ortak kart (kayıt, şifre sıfırlama). */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="container" style={{ width: "100%", maxWidth: 420 }}>
      <div className="card card-elevated auth-card stack stack-lg">
        <div className="auth-brand">
          <LogoMark size={52} />
          <h1>{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
