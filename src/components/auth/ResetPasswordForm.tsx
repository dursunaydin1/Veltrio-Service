"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/auth/password";

/** Yeni şifre belirleme: sıfırlama bağlantısıyla açılan oturumda çalışır; şifre politikası uygulanır. */
export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const problems = [...validatePassword(password, data.user?.email ?? undefined)];
    if (password !== confirm) problems.push("Şifreler aynı değil.");
    setErrors(problems);
    if (problems.length > 0) return;

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setErrors(["Şifre güncellenemedi. Bağlantının süresi dolmuş olabilir; yeniden bağlantı isteyin."]);
    router.push("/dashboard");
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      {errors.length > 0 ? (
        <div className="alert alert-error" role="alert">
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      ) : null}
      <div className="form-group">
        <label className="form-label" htmlFor="rp-password">Yeni şifre</label>
        <input id="rp-password" className="form-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <small style={{ color: "var(--text-muted)" }}>En az 10 karakter, harf ve rakam içermeli.</small>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="rp-confirm">Yeni şifre (tekrar)</label>
        <input id="rp-confirm" className="form-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>{busy ? "Kaydediliyor…" : "Şifreyi güncelle"}</button>
    </form>
  );
}
