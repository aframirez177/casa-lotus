// Casa Lotus · public site (Astro, static MPA). See shared/CONTRATO.md §1.
// Dev: http://localhost:4321, proxying /api → server (8787) and /app → app (5180), so the whole
// platform runs on one origin exactly as in production.
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { request } from "node:http";

const DESTINOS = [["/api", 8787], ["/app", 5180]];

/**
 * /api → server and /app → app in dev. Astro's trailing-slash guard runs before Vite's own proxy and
 * would answer 404 to «/app/reservar» or «/api/publico/eventos», so this middleware goes first in the
 * stack (post hook, after Astro's). WebSocket upgrades (the app's HMR) still use Vite's proxy below.
 */
const proxyPlataforma = {
  name: "casa-lotus:proxy",
  enforce: "post",
  configureServer(server) {
    const reenviar = (req, res, next) => {
      const d = DESTINOS.find(([p]) => req.url === p || req.url.startsWith(p + "/") || req.url.startsWith(p + "?"));
      if (!d) return next();
      const salida = request({ host: "localhost", port: d[1], method: req.method, path: req.url, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      salida.on("error", () => {
        if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.end(`${d[0]} no responde en localhost:${d[1]} (¿está corriendo?)`);
      });
      req.pipe(salida);
    };
    return () => server.middlewares.stack.unshift({ route: "", handle: reenviar });
  },
};
const proxy = { "/app": { target: "http://localhost:5180", ws: true } };

/** /sitemap.xml as well as /sitemap-index.xml: the name people (and some crawlers) guess. */
const sitemapXml = {
  name: "casa-lotus:sitemap-xml",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      const out = fileURLToPath(dir);
      await copyFile(`${out}sitemap-0.xml`, `${out}sitemap.xml`).catch(() => {});
    },
  },
};

export default defineConfig({
  site: "https://casalotus.studio",
  trailingSlash: "always",
  output: "static",
  outDir: "./dist",
  build: { format: "directory", inlineStylesheets: "auto" },
  compressHTML: true,
  devToolbar: { enabled: false },
  server: { port: 4321 },
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  image: { responsiveStyles: false },
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Momo Trust Display",
      cssVariable: "--font-momo-display",
      fallbacks: ["sans-serif"],
      options: { variants: [{ src: ["./src/assets/fonts/momo-trust-display-latin.woff2"], weight: 400, style: "normal" }] },
    },
    {
      provider: fontProviders.local(),
      name: "Momo Trust Sans",
      cssVariable: "--font-momo-sans",
      fallbacks: ["sans-serif"],
      options: { variants: [{ src: ["./src/assets/fonts/momo-trust-sans-latin-wght.woff2"], weight: "200 800", style: "normal" }] },
    },
  ],
  integrations: [
    sitemap({
      filter: (page) => !/\/404\/?$/.test(page),
      changefreq: "weekly",
      lastmod: new Date(),
    }),
    sitemapXml,
  ],
  vite: {
    plugins: [tailwindcss(), proxyPlataforma],
    server: { proxy, fs: { allow: [".."] } },
  },
});
