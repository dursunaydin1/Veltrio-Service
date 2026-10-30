import type { Metadata } from "next";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Giriş Yap",
  description: "Veltrio Service yönetim paneline giriş yapın.",
};

const NOTICES: Record<string, string> = {
  revoked: "Bu cihaz iptal edildi; yerel veriler silindi. Yeniden kullanmak için cihazı yeniden kaydedin.",
  link: "Bağlantı geçersiz veya süresi dolmuş. Lütfen yeniden deneyin.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="container" style={{ width: "100%", maxWidth: 420 }}>
      <div className="card card-elevated auth-card stack stack-lg">
        <div className="auth-brand">
          <LogoMark size={60} />
          <div>
            <h1><Wordmark stacked /></h1>
            <p>Servis, satış ve stok yönetimi</p>
          </div>
        </div>

        <LoginForm notice={error ? NOTICES[error] : undefined} />

        <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          Hesabınızı mı unuttunuz?{" "}
          <a href="mailto:destek@veltrio.com">Yardım alın</a>
        </p>
      </div>

      <p style={{ textAlign: "center", marginTop: 20, fontSize: "0.75rem", color: "var(--text-muted)", opacity: 0.7 }}>
        Veltrio Service v0.1.0 · MVP
      </p>
    </div>
  );
}
