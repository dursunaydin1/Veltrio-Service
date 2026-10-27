import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/layout/AppProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";


export const metadata: Metadata = {
  title: {
    default: "Veltrio Servis",
    template: "%s | Veltrio Servis",
  },
  description: "Tarım ve Ağaç Makineleri Servis, Satış ve Stok Yönetimi",
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }] },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Veltrio",
  },
  keywords: ["servis", "stok", "satış", "tarım makineleri"],
};

export const viewport: Viewport = {
  themeColor: "#0f0f11",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" data-scroll-behavior="smooth" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Tema seçimini boyamadan önce uygula (yanıp sönme olmasın) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
