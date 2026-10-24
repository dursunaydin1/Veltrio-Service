"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/auth/password";

/** Hesap oluşturma (Adım 1.3): e-posta zorunludur, çünkü hesap kurtarma e-postayla yapılır (AC-048). */
export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problems = [...validatePassword(password, email)];
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) problems.unshift("Geçerli bir e-posta adresi girin; hesap kurtarma bu adrese yapılır.");
    if (password !== confirm) problems.push("Şifreler aynı değil.");
    setErrors(problems);
    if (problems.length > 0) return;

    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    setBusy(false);
    if (error) {
      setErrors([error.message.includes("registered") ? "Bu e-posta ile zaten bir hesap var." : "Hesap oluşturulamadı. Lütfen tekrar deneyin."]);
      return;
    }
    // E-posta doğrulaması kapalıysa hesap hemen oturum açar → kuruluma geç
    if (data.session) {
      router.push("/dashboard");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="stack stack-md">
        <div className="alert alert-success" role="status">
          Doğrulama bağlantısı <strong>{email}</strong> adresine gönderildi. Bağlantıya dokunduktan sonra işletme kurulumuna devam edeceksiniz.
        </div>
        <Link href="/login" className="btn btn-secondary btn-full">Girişe dön</Link>
      </div>
    );
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      {errors.length > 0 ? (
        <div className="alert alert-error" role="alert">
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      ) : null}
      <div className="form-group">
        <label className="form-label" htmlFor="reg-email">E-posta *</label>
        <input id="reg-email" className="form-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="reg-password">Şifre *</label>
        <input id="reg-password" className="form-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <small style={{ color: "var(--text-muted)" }}>En az 10 karakter, harf ve rakam içermeli.</small>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="reg-confirm">Şifre (tekrar) *</label>
        <input id="reg-confirm" className="form-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>{busy ? "Oluşturuluyor…" : "Hesap oluştur"}</button>
      <Link href="/login" className="btn btn-ghost btn-full">Zaten hesabım var</Link>
    </form>
  );
}
