/** @type {import('next').NextConfig} */

/**
 * Güvenlik başlıkları (Adım 7.2, NFR-005): HTTPS zorunluluğu (HSTS), içerik türü sezgisinin kapatılması,
 * çerçeve içine gömmenin engellenmesi, yönlendiren bilgisinin kısıtlanması ve yalnızca QR için kamera izni.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
];

/**
 * İçerik güvenlik politikası (K-053): betik, stil ve bağlantılar yalnızca kendi sunucumuz ve Supabase.
 * Next.js satır içi betikleri için 'unsafe-inline' gerekir; geliştirmede Turbopack 'unsafe-eval' istediğinden
 * yalnızca üretimde uygulanır. Fotoğraf ve QR için data:/blob: görsellere izin verilir.
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "https://*.supabase.co";
  }
})();
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^https/, "wss")}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({ key: "Content-Security-Policy", value: contentSecurityPolicy });
}

const nextConfig = {
  // Turbopack etkin (Next.js 16 varsayılanı). next-pwa Turbopack ile uyumsuz olduğundan
  // çevrimdışı çalışma public/sw.js ile (yerel service worker) sağlanır.
  turbopack: {},
  // Geliştirmede sol altta çıkan Next.js "N" göstergesini kapatır
  devIndicators: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Service worker her zaman güncel kontrol edilmeli; önbelleğe alınırsa güncelleme gelmez
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
