// Post-build checks on site/dist (run by `npm run build`). Fails the build on anything that would ship
// broken; warns on content still pending with Ana (data-todo).
// - every internal link, image, video, poster, caption and srcset entry resolves to a file in dist
//   (/app/ and /api/ belong to the app and the server: only their shape is checked)
// - in-page anchors (#id) exist
// - every booking link to /app/reservar carries a ref, and every page has one <h1>, a title, a description
// - JSON-LD parses, has a @graph, and its FAQ / breadcrumb / offer nodes are complete
// - each page's og:image exists, is 1200×630 and under 300 KB (WhatsApp drops bigger previews)
// - copy rules: no gendered teachers, no class-size numbers in text
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const SITIO = "https://casalotus.studio";
const errores = [], avisos = [];
const fallo = (m, f) => errores.push(`✗ ${m}${f ? `  (${f})` : ""}`);
const aviso = (m, f) => avisos.push(`⚠︎ ${m}${f ? `  (${f})` : ""}`);
const existe = (p) => stat(p).then((s) => s.isFile() || s.isDirectory(), () => false);

async function archivos(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    out.push(...(e.isDirectory() ? await archivos(p) : [p]));
  }
  return out;
}

/** dist file for a site path ("/clases/" → dist/clases/index.html). */
async function destino(ruta) {
  const limpia = decodeURIComponent(ruta.split(/[?#]/)[0]);
  const p = join(DIST, limpia);
  if (limpia.endsWith("/")) return (await existe(join(p, "index.html"))) ? join(p, "index.html") : null;
  return (await existe(p)) ? p : null;
}

const todos = await archivos(DIST);
const paginas = todos.filter((f) => extname(f) === ".html");
const ids = new Map();
for (const f of paginas) {
  const html = await readFile(f, "utf8");
  ids.set(f, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
}

let todo = 0;
// @ids defined on one page and referenced from others (plan §3.1): collected from every page first
const CONOCIDOS = new Set();
for (const f of paginas) {
  const html = await readFile(f, "utf8");
  for (const b of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { for (const n of JSON.parse(b[1])["@graph"] ?? []) if (n["@id"]) CONOCIDOS.add(n["@id"]); } catch { /* reported below */ }
  }
}
const texto = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");

for (const f of paginas) {
  const rel = relative(DIST, f);
  const html = await readFile(f, "utf8");
  const esRedirect = /http-equiv="refresh"/.test(html);
  if (esRedirect) continue;

  // head basics
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) fallo(`${h1} <h1> (expected 1)`, rel);
  if (!/<title>[^<]{10,}<\/title>/.test(html)) fallo("missing <title>", rel);
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  if (desc.length < 70 || desc.length > 175) aviso(`meta description is ${desc.length} characters`, rel);
  if (!rel.startsWith("404") && !/<link rel="canonical" href="https:\/\/casalotus\.studio\//.test(html)) fallo("missing canonical", rel);
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  if (noindex !== rel.startsWith("404")) fallo(noindex ? "public page marked noindex" : "404 must be noindex", rel);

  // references
  const refs = [];
  for (const m of html.matchAll(/\s(href|src|poster|data-src|data-video|data-poster|data-captions|content)="([^"]+)"/g)) {
    const [, attr, v] = m;
    if (attr === "content") { if (v.startsWith(SITIO + "/og/") || v.startsWith(SITIO + "/icons/")) refs.push(v.slice(SITIO.length)); continue; }
    refs.push(v);
  }
  for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) for (const parte of m[1].split(",")) refs.push(parte.trim().split(/\s+/)[0]);
  for (const r of refs) {
    if (/^(https?:|mailto:|tel:|data:|javascript:)/.test(r)) continue;
    if (r.startsWith("#")) { if (r.length > 1 && !ids.get(f).has(decodeURIComponent(r.slice(1)))) fallo(`anchor ${r} has no target`, rel); continue; }
    if (r.startsWith("/app") || r.startsWith("/api/")) {
      if (r.startsWith("/app/reservar") && !/[?&]ref=/.test(r.replaceAll("&amp;", "&"))) fallo(`booking link without ref: ${r}`, rel);
      continue;
    }
    if (!r.startsWith("/")) { fallo(`relative path "${r}" (use root-relative paths)`, rel); continue; }
    const t = await destino(r.replaceAll("&amp;", "&"));
    if (!t) { fallo(`missing ${r}`, rel); continue; }
    const hash = r.split("#")[1];
    if (hash && extname(t) === ".html" && !ids.get(t)?.has(hash)) fallo(`anchor ${r} has no target`, rel);
  }
  if (/\shref="\/[^"#?]*[^/"#?.][?#"]/.test(html.replace(/href="\/(app|api)[^"]*"/g, "").replace(/href="\/[^"]*\.[a-z0-9]+"/g, ""))) fallo("internal page link without trailing slash", rel);

  // booking links keep their ref; CTAs are measurable
  for (const m of html.matchAll(/<a\b[^>]*href="\/app\/reservar[^"]*"[^>]*>/g)) if (!/data-cta="/.test(m[0])) aviso(`booking link without data-cta: ${m[0].slice(0, 90)}…`, rel);

  // JSON-LD
  const bloques = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!bloques.length) fallo("no JSON-LD", rel);
  for (const b of bloques) {
    let ld;
    try { ld = JSON.parse(b[1]); } catch (e) { fallo(`JSON-LD does not parse: ${e.message}`, rel); continue; }
    if (ld["@context"] !== "https://schema.org" || !Array.isArray(ld["@graph"])) { fallo("JSON-LD without @context / @graph", rel); continue; }
    const porId = new Map(ld["@graph"].filter((n) => n["@id"]).map((n) => [n["@id"], n]));
    for (const n of ld["@graph"]) {
      const tipos = [].concat(n["@type"]);
      if (!n["@type"]) fallo("JSON-LD node without @type", rel);
      if (tipos.includes("FAQPage") || (n.mainEntity && Array.isArray(n.mainEntity))) {
        for (const q of n.mainEntity ?? []) if (q["@type"] !== "Question" || !q.name || !q.acceptedAnswer?.text) fallo("incomplete FAQ Question", rel);
      }
      if (tipos.includes("BreadcrumbList")) n.itemListElement.forEach((it, i) => { if (it.position !== i + 1 || !it.name || !String(it.item).startsWith(SITIO)) fallo("bad BreadcrumbList item", rel); });
      if (tipos.includes("Offer") && (typeof n.price !== "number" || n.priceCurrency !== "COP")) fallo("Offer without numeric COP price", rel);
      if (tipos.includes("VideoObject") && !(n.name && n.thumbnailUrl && n.uploadDate && n.contentUrl && n.duration)) fallo("incomplete VideoObject", rel);
      for (const k of ["isPartOf", "about", "breadcrumb", "publisher", "provider", "parentOrganization", "worksFor", "hasPart"]) {
        const ref = n[k]?.["@id"];
        if (ref && ref.startsWith(SITIO) && !porId.has(ref) && !CONOCIDOS.has(ref)) fallo(`JSON-LD ${k} → ${ref} defined nowhere`, rel);
      }
    }
  }

  // Open Graph image
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if (!og) fallo("missing og:image", rel);
  else {
    const p = join(DIST, og.replace(SITIO, ""));
    if (!(await existe(p))) fallo(`og:image ${og} not built`, rel);
    else {
      const buf = await readFile(p);
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      if (w !== 1200 || h !== 630) fallo(`og:image is ${w}×${h}`, rel);
      if (buf.length > 300 * 1024) fallo(`og:image is ${(buf.length / 1024).toFixed(0)} KB (> 300 KB)`, rel);
    }
  }
  if (!/<meta property="og:image:alt" content="[^"]{10,}"/.test(html)) fallo("missing og:image:alt", rel);

  // copy rules
  const t = texto(html);
  for (const m of t.matchAll(/\b(profesoras?|instructoras?|las profes|la profe|el profe|los profes)\b/gi)) {
    const contexto = t.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, " ");
    // the consent texts are versioned in shared/consentimientos.js: reported, not rewritten here
    (/descargo|indicaciones de la profe|comunicarse a la profe|avisarle a la profe|la profe de tu clase/i.test(contexto) ? aviso : fallo)(`gendered teacher: «…${contexto}…»`, rel);
  }
  for (const m of t.matchAll(/\b(\d+)\s+(columpios|cupos|personas por clase|alumn[ao]s por clase)\b/gi)) fallo(`class size in text: «${m[0]}»`, rel);

  const n = (html.match(/data-todo/g) || []).length;
  if (n) { todo += n; aviso(`${n} block(s) still marked data-todo (content pending with Ana)`, rel); }
}

// files every platform piece links to
for (const f of ["robots.txt", "llms.txt", "llms-full.txt", "sitemap-index.xml", "sitemap.xml", "manifest.webmanifest", "favicon.ico", "favicon.svg", "apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/monochrome-512.png", "404.html"]) {
  if (!(await existe(join(DIST, f)))) fallo(`missing /${f}`);
}
const robots = await readFile(join(DIST, "robots.txt"), "utf8").catch(() => "");
// plan §5.6: /api/ disallowed; /app/ crawlable so Google can see its noindex
if (!/Disallow: \/api\//.test(robots)) fallo("robots.txt must disallow /api/");
if (/Disallow: \/app/.test(robots)) fallo("robots.txt must not disallow /app/ (Google has to see its noindex)");
if (/Disallow: \/\s*$/m.test(robots)) fallo("robots.txt blocks the whole site");
const manifest = JSON.parse(await readFile(join(DIST, "manifest.webmanifest"), "utf8").catch(() => "{}"));
for (const i of manifest.icons ?? []) if (!(await destino(i.src))) fallo(`manifest icon ${i.src} missing`);

const peso = (await Promise.all(todos.map((f) => stat(f).then((s) => s.size)))).reduce((a, b) => a + b, 0);
avisos.forEach((a) => console.log(a));
console.log(`dist: ${paginas.length} pages, ${todos.length} files, ${(peso / 1048576).toFixed(1)} MB · pending data-todo: ${todo}`);
if (errores.length) {
  errores.forEach((e) => console.log(e));
  console.log(`${errores.length} error(s)`);
  process.exit(1);
}
console.log("✓ links, assets, JSON-LD, Open Graph and copy rules check out");
