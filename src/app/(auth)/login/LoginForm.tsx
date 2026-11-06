"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { loginAction } from "./actions";
import { PasswordInput } from "@/components/auth/PasswordInput";

/** "E-postamı hatırla" (K-074): yalnızca e-posta bu cihazda saklanır; şifreyi telefonun şifre yöneticisi hatırlar. */
const REMEMBER_KEY = "veltrio_login_email";

export function LoginForm({ notice }: { notice?: string }) {
  const [error, setError]       = useState<string | null>(notice ?? null);
  const [isPending, startTransition] = useTransition();
  const [remember, setRemember] = useState(true);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_KEY);
      if (saved && emailRef.current && !emailRef.current.value) {
        emailRef.current.value = saved;
        passwordRef.current?.focus();
      }
    } catch {
      // Depolama kapalıysa e-posta her seferinde yazılır.
    }
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const email = String(formData.get("email") ?? "").trim();
      if (remember && email) window.localStorage.setItem(REMEMBER_KEY, email);
      else window.localStorage.removeItem(REMEMBER_KEY);
    } catch {
      // yok sayılır
    }
    formData.set("next", new URLSearchParams(window.location.search).get("next") ?? "");

    startTransition(async () => {
      const result = await loginAction(formData);
      if ("error" in result && result.error) setError(result.error);
      else if ("next" in result && result.next) window.location.replace(result.next);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="stack stack-lg" noValidate aria-busy={isPending}>
      {/* Hata mesajı */}
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {/* E-posta */}
      <div className="form-group">
        <label htmlFor="email" className="form-label">
          E-posta Adresi
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          placeholder="ornek@mail.com"
          className="form-input"
          inputMode="email"
        />
      </div>

      {/* Şifre */}
      <div className="form-group">
        <div className="row row-between" style={{ marginBottom: 6 }}>
          <label htmlFor="password" className="form-label" style={{ margin: 0 }}>
            Şifre
          </label>
        </div>
        <PasswordInput
          ref={passwordRef}
          id="password"
          name="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          placeholder="••••••••"
        />
      </div>

      <label className="toggle-row toggle-inline">
        <span>E-postamı hatırla</span>
        <input type="checkbox" className="switch" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      </label>

      {/* Giriş butonu */}
      <button
        id="login-submit-btn"
        type="submit"
        disabled={isPending}
        className={`btn btn-primary btn-full btn-lg ${isPending ? "btn-loading" : ""}`}
        style={{ marginTop: 4 }}
      >
        {isPending ? "Giriş yapılıyor…" : "Giriş Yap"}
      </button>

      <div className="stack stack-sm" style={{ alignItems: "center" }}>
        <Link href="/forgot-password">Şifremi unuttum</Link>
        <Link href="/register">Hesap oluştur</Link>
      </div>
    </form>
  );
}
