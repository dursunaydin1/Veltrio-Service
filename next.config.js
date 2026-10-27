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
