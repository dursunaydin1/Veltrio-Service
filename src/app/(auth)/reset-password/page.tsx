import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Yeni şifre belirle" };

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Yeni şifre belirle">
      <ResetPasswordForm />
    </AuthCard>
  );
}
