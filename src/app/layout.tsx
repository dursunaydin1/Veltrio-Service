import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/layout/AppProvider";
import "./globals.css";


export const metadata: Metadata = {
  title: {
    default: "Veltrio Servis",
    template: "%s | Veltrio Servis",
  },
  description: "Tarım ve Ağaç Makineleri Servis, Satış ve Stok Yönetimi",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Veltrio",
  },
  keywords: ["servis", "stok", "satış", "tarım makineleri"],
};

export const viewport: Viewport = {
  themeColor: "#1c1c1e",
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
    <html lang="tr">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
