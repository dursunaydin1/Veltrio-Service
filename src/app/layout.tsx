import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/layout/AppProvider";
import "./globals.css";


export const metadata: Metadata = {
  // Sekmede tüm sayfalarda logo ve "Veltrio Service" (sayfa adı eklenmez; üst çubukla aynı ad)
  title: {
    default: "Veltrio Service",
    template: "Veltrio Service",
  },
  description: "Tarım ve Ağaç Makineleri Servis, Satış ve Stok Yönetimi",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon.svg?v=3", type: "image/svg+xml" },
      { url: "/icons/icon-192x192.png?v=3", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Veltrio",
  },
  keywords: ["servis", "stok", "satış", "tarım makineleri"],
};

export const viewport: Viewport = {
  themeColor: "#0b1120",
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
    <html lang="tr" data-scroll-behavior="smooth">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=3" />
      </head>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
