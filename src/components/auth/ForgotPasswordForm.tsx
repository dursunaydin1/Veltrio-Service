"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Hesap kurtarma (Adım 1.3): e-postaya şifre sıfırlama bağlantısı gönderir. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Geçerli bir e-posta adresi girin.");
    setBusy(true);
    const supabase = createClient();
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (e) return setError("Bağlantı gönderilemedi. Lütfen biraz sonra tekrar deneyin.");
    setSent(true);
  }

  if (sent) {
    return (
      <div className="stack stack-md">
        <div className="alert alert-success" role="status">
          Bu e-posta ile bir hesap varsa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu (ve spam klasörünü) kontrol edin.
        </div>
        <Link href="/login" className="btn btn-secondary btn-full">Girişe dön</Link>
      </div>
    );
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <p>Hesabınızın e-posta adresini yazın; şifrenizi yenilemeniz için bağlantı göndereceğiz.</p>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="form-group">
        <label className="form-label" htmlFor="fp-email">E-posta</label>
        <input id="fp-email" className="form-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </div>
      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>{busy ? "Gönderiliyor…" : "Bağlantı gönder"}</button>
      <Link href="/login" className="btn btn-ghost btn-full">Girişe dön</Link>
    </form>
  );
}
