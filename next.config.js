const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // next-pwa next.config.js formatı gerektiriyor
};

module.exports = withPWA(nextConfig);
