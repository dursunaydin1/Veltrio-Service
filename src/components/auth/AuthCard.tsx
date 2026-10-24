import type { ReactNode } from "react";

/** Giriş dışı hesap ekranları için ortak kart (kayıt, şifre sıfırlama). */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="container" style={{ width: "100%", maxWidth: 420 }}>
      <div className="card card-elevated stack stack-lg" style={{ padding: "32px 28px", border: "1px solid var(--border-default)" }}>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}
