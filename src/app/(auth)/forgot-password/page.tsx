import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Şifremi unuttum" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Şifremi unuttum">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
