import { redirect } from "next/navigation";

/** Kök adres: oturumsuzsa proxy.ts giriş sayfasına yönlendirir. */
export default function Home() {
  redirect("/dashboard");
}
