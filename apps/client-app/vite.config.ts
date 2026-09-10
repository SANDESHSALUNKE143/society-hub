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
        // Matches Vite’s own “➜  Local:” style so the preferred host is obvious.
        console.log(`  ➜  ${label}: ${url}`);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    announceLocalUrl("Client App", "http://app.localhost:5173/"),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
  preview: {
    host: true,
    port: 5173,
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
