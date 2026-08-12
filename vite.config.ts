import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
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
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("\\react\\")) {
            return "react-vendor";
          }
          if (id.includes("@tauri-apps")) return "tauri-vendor";
          if (id.includes("@dnd-kit")) return "dnd-vendor";
          if (
            id.includes("react-markdown") ||
            id.includes("remark-") ||
            id.includes("mdast") ||
            id.includes("micromark") ||
            id.includes("unist") ||
            id.includes("vfile")
          ) {
            return "markdown-vendor";
          }
          if (id.includes("zustand")) return "zustand";
        },
      },
    },
  },
});
