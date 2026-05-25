import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@videotogetherlite/shared": resolve(root, "../../packages/shared/src/index.ts")
    }
  },
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        background: resolve(root, "src/background/index.ts"),
        content: resolve(root, "src/content/index.ts"),
        page: resolve(root, "src/page/index.tsx"),
        popup: resolve(root, "popup.html")
      },
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
        entryFileNames: "[name].js"
      }
    },
    sourcemap: true,
    target: "es2022"
  },
  publicDir: "public",
  test: {
    environment: "jsdom"
  }
});
