// Dev only: the site owns /manifest.webmanifest, /favicon.svg and /icons/*. When the app runs alone on :5180,
// serve stand-ins so the console stays clean (in production and behind the site's dev proxy they are real).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const MANIFIESTO = { name: "Casa Lotus", short_name: "Casa Lotus", start_url: "/app/", scope: "/", display: "standalone", background_color: "#F6F8FC", theme_color: "#F6F8FC", icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }] };

export function iconosDev() {
  return {
    name: "casa-lotus-iconos-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url.split("?")[0];
        if (url === "/manifest.webmanifest") { res.setHeader("Content-Type", "application/manifest+json"); return res.end(JSON.stringify(MANIFIESTO)); }
        const archivos = { "/favicon.svg": ["site/public/favicon.svg", "src/favicon.svg"], "/apple-touch-icon.png": ["site/public/apple-touch-icon.png", "src/apple-touch-icon.png"] };
        if (archivos[url] || url.startsWith("/icons/")) {
          const candidatos = archivos[url] || ["site/public" + url];
          const f = candidatos.map((c) => raiz + c).find(existsSync);
          if (f) { res.setHeader("Content-Type", f.endsWith(".svg") ? "image/svg+xml" : "image/png"); return res.end(readFileSync(f)); }
          res.statusCode = 204; return res.end();
        }
        next();
      });
    },
  };
}
