"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { loginAction } from "./actions";

export function LoginForm({ notice }: { notice?: string }) {
  const [error, setError]       = useState<string | null>(notice ?? null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("next", new URLSearchParams(window.location.search).get("next") ?? "");

    startTransition(async () => {
      const result = await loginAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="stack stack-lg" noValidate>
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
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          placeholder="••••••••"
          className="form-input"
        />
      </div>

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
