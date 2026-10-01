// Casa Lotus app · Vite config. Served under /app/ on casalotus.studio; the API lives on the same origin.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { iconosDev } from "./vite.dev-iconos.js";

const compartido = fileURLToPath(new URL("../shared", import.meta.url));

export default defineConfig({
  base: "/app/",
  plugins: [
    react(),
    tailwindcss(),
    iconosDev(),
    VitePWA({
      // The site owns /manifest.webmanifest and the icons; index.html links them.
      manifest: false,
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      injectRegister: false,
      scope: "/app/",
      base: "/app/",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // the demo adapter is never needed offline in production
        globIgnores: ["**/demo-*.js"],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { "@compartido": compartido } },
  server: {
    port: 5180,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: false } },
    fs: { allow: [fileURLToPath(new URL(".", import.meta.url)), compartido] },
  },
  preview: { port: 5181, proxy: { "/api": { target: "http://localhost:8787" } } },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        // the demo studio gets a recognizable name so the service worker never precaches it
        chunkFileNames: (c) => (c.facadeModuleId?.includes("/api/mock/") ? "assets/demo-[hash].js" : "assets/[name]-[hash].js"),
        // vendors in long-lived chunks (they change less often than the screens)
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          if (id.includes("node_modules/react-router")) return "router";
          if (id.includes("node_modules/@tanstack")) return "query";
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    env: { TZ: "America/Bogota" },
  },
});
