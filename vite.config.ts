import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  build: {
    outDir: "dist", sourcemap: false, target: "es2022",
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), storefront: resolve(__dirname, "storefront.html") } },
  },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 20000 },
});
