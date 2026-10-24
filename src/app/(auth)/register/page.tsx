import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Hesap oluştur" };

export default function RegisterPage() {
  return (
    <AuthCard title="Hesap oluştur">
      <RegisterForm />
    </AuthCard>
  );
}
