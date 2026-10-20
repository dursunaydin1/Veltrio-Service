"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const email    = formData.get("email")    as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "E-posta ve şifre zorunludur." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Kullanıcıya güvenli hata mesajı göster
    if (
      error.message.includes("Invalid login credentials") ||
      error.message.includes("invalid_grant")
    ) {
      return { error: "E-posta veya şifre hatalı." };
    }
    if (error.message.includes("Email not confirmed")) {
      return { error: "E-posta adresinizi onaylayın." };
    }
    return { error: "Giriş yapılamadı. Lütfen tekrar deneyin." };
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
