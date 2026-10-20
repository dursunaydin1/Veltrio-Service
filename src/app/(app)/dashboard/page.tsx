import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        background: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      <div style={{ fontSize: 48 }}>🚀</div>
      <h1 style={{ fontSize: "1.5rem" }}>Dashboard</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Temel altyapı hazır; uygulama ekranları geliştiriliyor.
      </p>
    </div>
  );
}
