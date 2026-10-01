// Build the whole public bundle into web/dist: the site (Astro) at /, the app (React PWA) at /app/.
// The API is not part of it: it ships as a container (scripts/desplegar-api.sh).
//
//   node scripts/construir.mjs            build both, assemble, check
//   node scripts/construir.mjs --sin-build only assemble and check (CI builds each part in its own step)
//
// It fails when the bundle is incomplete or when something private leaks into it: this repo and its
// output are public, and business figures (teacher pay, the commission) must never ship.
import { execSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(WEB, "dist");
const inCI = !!process.env.GITHUB_ACTIONS;
const errores = [];
const fallar = (msg, archivo) => errores.push(inCI ? `::error file=${archivo ?? ""}::${msg}` : `✗  ${msg}${archivo ? ` (${archivo})` : ""}`);
const avisar = (msg, archivo) => console.log(inCI ? `::warning file=${archivo ?? ""}::${msg}` : `⚠︎  ${msg}${archivo ? ` (${archivo})` : ""}`);
const existe = (p) => stat(p).then(() => true, () => false);

if (!process.argv.includes("--sin-build")) {
  for (const parte of ["site", "app"]) {
    console.log(`→ ${parte}: npm run build`);
    execSync("npm run build", { cwd: join(WEB, parte), stdio: "inherit" });
  }
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(join(WEB, "site", "dist"), DIST, { recursive: true });
await cp(join(WEB, "app", "dist"), join(DIST, "app"), { recursive: true });

async function recorrer(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    out.push(...(e.isDirectory() ? await recorrer(p) : [p]));
  }
  return out;
}
const archivos = await recorrer(DIST);
const rel = (p) => relative(DIST, p);

// 1. the pieces every visitor and crawler needs
for (const f of ["index.html", "404.html", "robots.txt", "sitemap-index.xml", "llms.txt", "manifest.webmanifest", "favicon.svg", "apple-touch-icon.png",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "app/index.html"]) {
  if (!(await existe(join(DIST, f)))) fallar(`falta ${f}`);
}

// 2. every page has its own Open Graph image, and it is small enough for WhatsApp previews
const paginas = archivos.filter((p) => p.endsWith(".html") && !rel(p).startsWith("app/"));
for (const p of paginas) {
  const html = await readFile(p, "utf8");
  if (/name="robots" content="noindex/.test(html)) continue;
  const og = html.match(/property="og:image" content="https:\/\/casalotus\.studio(\/[^"]+)"/);
  if (!og) { fallar("página sin og:image", rel(p)); continue; }
  const img = join(DIST, og[1]);
  if (!(await existe(img))) fallar(`og:image no existe: ${og[1]}`, rel(p));
  else if ((await stat(img)).size > 300 * 1024) fallar(`og:image pesa más de 300 KB: ${og[1]}`, rel(p));
  if (html.includes("data-todo")) avisar("contenido pendiente (data-todo)", rel(p));
}

// 3. nothing private ships: teacher pay, the commission, internal pages
for (const p of archivos) if (/(^|\/)(auditoria|exploraciones)(\/|$)/.test(rel(p))) fallar("página interna en el bundle", rel(p));
const prohibido = [/\$?\b55[.]?000\b/, /comisi[oó]n/i];
for (const p of archivos.filter((f) => /\.(html|js|css|txt|json|xml|webmanifest)$/.test(f))) {
  const texto = await readFile(p, "utf8");
  for (const r of prohibido) if (r.test(texto)) fallar(`contenido privado (${r})`, rel(p));
}

if (errores.length) {
  console.error(errores.join("\n"));
  process.exit(1);
}
console.log(`✓ dist listo: ${paginas.length} páginas del sitio + la app en /app/ (${archivos.length} archivos)`);
