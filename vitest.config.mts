import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    // Ekran (bileşen) testleri *.test.tsx: dosya başında `// @vitest-environment jsdom` (K-117)
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
