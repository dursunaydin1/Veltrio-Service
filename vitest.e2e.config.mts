import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Uçtan uca (sunucuya karşı) testler: `npm run test:e2e`.
 * Gerçek Supabase projesine bağlanır ve ORADA TEST VERİSİ OLUŞTURUR; bu yüzden
 * normal `npm test` içinde çalışmaz. Çalıştırmak için E2E_EMAIL ve E2E_PASSWORD
 * ortam değişkenleri gerekir (dosyalara yazılmaz).
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["e2e/**/*.e2e.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
