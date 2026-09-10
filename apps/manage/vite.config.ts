import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

/** Print the canonical *.localhost URL Vite would otherwise hide behind 0.0.0.0. */
function announceLocalUrl(label: string, url: string): Plugin {
  return {
    name: "societyhub-announce-local-url",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        console.log(`  ➜  ${label}: ${url}`);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    announceLocalUrl("Manage", "http://manage.localhost:5174/"),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
  preview: {
    host: true,
    port: 5174,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
