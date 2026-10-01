// Dev only: the site owns /manifest.webmanifest, /favicon.svg and /icons/*. In dev, Vite rewrites the absolute
// links in index.html under the /app/ base, so both "/x" and "/app/x" are answered here: from the site's dev
// server (:4321) when it runs, otherwise from its public/ folder or a stand-in. Production keeps the root paths.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const MANIFIESTO = { name: "Casa Lotus", short_name: "Casa Lotus", start_url: "/app/?fuente=pwa", scope: "/", display: "standalone", background_color: "#F6F8FC", theme_color: "#F6F8FC", icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }] };
const TIPOS = { ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const tipo = (url) => TIPOS[url.slice(url.lastIndexOf("."))] || "application/octet-stream";

export function iconosDev() {
  return {
    name: "casa-lotus-iconos-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url.split("?")[0].replace(/^\/app(?=\/(manifest\.webmanifest|favicon\.svg|favicon\.ico|apple-touch-icon\.png|icons\/))/, "");
        if (!/^\/(manifest\.webmanifest|favicon\.svg|favicon\.ico|apple-touch-icon\.png|icons\/[\w.-]+)$/.test(url)) return next();
        res.setHeader("Content-Type", tipo(url));
        try {
          const r = await fetch("http://localhost:4321" + url, { signal: AbortSignal.timeout(800) });
          if (r.ok && !String(r.headers.get("content-type")).includes("text/html")) return res.end(Buffer.from(await r.arrayBuffer()));
        } catch { /* the site is not running: local fallback */ }
        const archivo = [raiz + "site/public" + url, raiz + "src" + url].find(existsSync);
        if (archivo) return res.end(readFileSync(archivo));
        if (url === "/manifest.webmanifest") return res.end(JSON.stringify(MANIFIESTO));
        res.statusCode = 204;
        res.end();
      });
    },
  };
}
