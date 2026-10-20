/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack etkin (Next.js 16 default)
  // next-pwa Turbopack ile uyumsuz — FAZ 6'da native service worker ile değiştirilecel
  turbopack: {},
};

module.exports = nextConfig;
