import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (normalized.includes("lunar-typescript")) return "lunar";
          if (normalized.includes("/src/lib/widgetRefresh")) return "widget-refresh";
          if (normalized.includes("/src/lib/anniversaries")) return "anniversaries";
          if (!normalized.includes("node_modules")) return;
          if (normalized.includes("react-dom") || normalized.includes("/react/") || id.includes("\\react\\")) {
            return "react-vendor";
          }
          if (normalized.includes("@tauri-apps")) return "tauri-vendor";
          if (normalized.includes("@dnd-kit")) return "dnd-vendor";
          if (
            normalized.includes("react-markdown") ||
            normalized.includes("remark-") ||
            normalized.includes("mdast") ||
            normalized.includes("micromark") ||
            normalized.includes("unist") ||
            normalized.includes("vfile")
          ) {
            return "markdown-vendor";
          }
          if (normalized.includes("zustand")) return "zustand";
        },
      },
    },
  },
});
