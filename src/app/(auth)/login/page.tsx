import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Giriş Yap",
  description: "Veltrio Servis yönetim paneline giriş yapın.",
};

export default function LoginPage() {
  return (
    <div className="container" style={{ width: "100%", maxWidth: 420 }}>
      {/* Kart */}
      <div
        className="card card-elevated"
        style={{
          padding: "40px 32px",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Logo & Başlık */}
        <div
          className="stack"
          style={{ alignItems: "center", gap: 16, marginBottom: 36 }}
        >
          {/* Logo ikonu */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "var(--accent-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
            aria-hidden="true"
          >
            🔧
          </div>

          <div style={{ textAlign: "center" }}>
            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "var(--text-primary)",
                marginBottom: 6,
              }}
            >
              Veltrio Servis
            </h1>
            <p
              style={{
                fontSize: "0.9rem",
                color: "var(--text-muted)",
                lineHeight: 1.4,
              }}
            >
              Servis, Satış ve Stok Yönetimi
            </p>
          </div>
        </div>

        {/* Bölücü */}
        <hr className="divider" style={{ marginBottom: 28 }} />

        {/* Form */}
        <LoginForm />

        {/* Alt bilgi */}
        <p
          style={{
            textAlign: "center",
            marginTop: 28,
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
          }}
        >
          Hesabınızı mı unuttunuz?{" "}
          <a href="mailto:destek@veltrio.com" style={{ color: "var(--accent-light)" }}>
            Yardım alın
          </a>
        </p>
      </div>

      {/* Alt versiyon bilgisi */}
      <p
        style={{
          textAlign: "center",
          marginTop: 20,
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          opacity: 0.6,
        }}
      >
        Veltrio Servis v0.1.0 · MVP
      </p>
    </div>
  );
}
