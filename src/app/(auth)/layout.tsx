export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 60%), var(--bg-base)",
      }}
    >
      {children}
    </main>
  );
}
