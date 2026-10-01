// (a) The public site: every page loads clean and carries its SEO contract, and the copy keeps Ana's rules:
// no swing or class-size number anywhere, teachers never gendered. The app (/app/) stays out of the index.
import { test, expect } from "../lib/prueba.js";
import { SITIO } from "../lib/entorno.js";

export const PAGINAS = [
  "/", "/clases/", "/clases/yoga-aereo/", "/clases/pilates-aereo/", "/clases/stretch-aereo/", "/clases/yoga-aereo-multinivel/",
  "/clase-de-prueba/", "/planes/", "/horarios/", "/metodo-aereo/", "/preguntas/", "/nosotros/", "/terminos/", "/privacidad/",
];

const NUMEROS = "(?:\\d+|un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)";
/** Any statement of how many swings / people a class holds. */
const CUPO = new RegExp(
  [
    `\\b${NUMEROS}\\s+(?:columpios|cupos|telas|hamacas|personas\\s+por\\s+clase|alumn[oa]s\\s+por\\s+clase|estudiantes\\s+por\\s+clase)\\b`,
    `\\b(?:máximo|max\\.?|hasta|solo|sólo|grupos?\\s+de)\\s+${NUMEROS}\\s+(?:personas|alumn[oa]s|estudiantes|columpios)\\b`,
    `\\bclases?\\s+de\\s+${NUMEROS}\\s+(?:personas|alumn[oa]s)\\b`,
  ].join("|"),
  "i",
);
/** «la profe», «el profe», «las profes», «una profe», «otra profe», «nuestras profes», «profesora(s)». */
const GENERO = /\b(?:la|el|las|los|una|un|otra|otro|nuestras|nuestros|esta|este|nueva|nuevo|buena|bueno)\s+profes?\b|\bprofesor(?:a|as|es)?\b/i;

/** Visible copy plus the text search engines and AI read (title, meta, alt, aria, JSON-LD). */
async function textoDe(page) {
  return page.evaluate(() => {
    const clon = document.body.cloneNode(true);
    clon.querySelectorAll("script,style,noscript,template,svg").forEach((n) => n.remove());
    const atributos = [...document.querySelectorAll("[alt],[aria-label],[title]")].map((n) => [n.getAttribute("alt"), n.getAttribute("aria-label"), n.getAttribute("title")].filter(Boolean).join(" "));
    const metas = [...document.querySelectorAll("meta[content]")].map((m) => m.getAttribute("content"));
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent);
    return [document.title, ...metas, clon.textContent, ...atributos, ...ld].join("\n").replace(/\s+/g, " ");
  });
}

const contexto = (texto, re) => { const m = texto.match(re); if (!m) return ""; const i = m.index; return "…" + texto.slice(Math.max(0, i - 60), i + m[0].length + 60) + "…"; };

for (const ruta of PAGINAS) {
  test(`sitio ${ruta}: carga limpia, un H1, SEO completo y copy según las reglas`, async ({ page, errores, request }) => {
    const r = await page.goto(ruta, { waitUntil: "load" });
    expect(r.status(), "HTTP status").toBe(200);
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.locator("h1"), "exactly one <h1>").toHaveCount(1);
    await expect(page.locator("h1")).not.toBeEmpty();

    const titulo = await page.title();
    expect(titulo.length, "title present").toBeGreaterThan(10);
    expect(titulo.length, `title ≤ 65 chars: «${titulo}»`).toBeLessThanOrEqual(65);
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc?.length ?? 0, "meta description present").toBeGreaterThan(50);
    expect(desc.length, `meta description ≤ 160 chars: «${desc}»`).toBeLessThanOrEqual(160);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://casalotus.studio" + ruta);
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og, "og:image is absolute").toMatch(/^https:\/\/casalotus\.studio\/.+\.(png|jpe?g|webp)$/);
    const ogLocal = await request.get(SITIO + new URL(og).pathname);
    expect(ogLocal.status(), `og:image ${new URL(og).pathname} is served`).toBe(200);
    expect(ogLocal.headers()["content-type"]).toMatch(/^image\//);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^(?!.*noindex).*\bindex\b/);

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.length, "JSON-LD present").toBeGreaterThan(0);
    for (const bloque of ld) {
      const datos = JSON.parse(bloque);
      expect(datos["@context"]).toMatch(/schema\.org/);
    }

    const texto = await textoDe(page);
    expect(texto.match(CUPO), `states a class size: ${contexto(texto, CUPO)}`).toBeNull();
    expect(texto.match(GENERO), `genders the teachers: ${contexto(texto, GENERO)}`).toBeNull();

    // every booking CTA hands off to the app with a ref
    const ctas = await page.locator('a[href^="/app/reservar"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const href of ctas) expect(href, "booking CTA carries ?ref=").toMatch(/[?&]ref=WEB-/);

    expect(errores, "console errors / exceptions").toEqual([]);
  });
}

test("404: página propia, noindex y un H1", async ({ page }) => {
  const r = await page.goto("/esta-pagina-no-existe/");
  expect(r.status()).toBe(404);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

for (const ruta of ["/app/entrar", "/app/reservar", "/app/mi", "/app/admin"]) {
  test(`app ${ruta}: noindex`, async ({ page }) => {
    await page.goto(ruta);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator("h1").first()).toBeVisible();
  });
}

test("robots.txt, sitemap y llms.txt", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Sitemap:\s*https:\/\/casalotus\.studio\/sitemap/i);
  expect(robots).toMatch(/^Disallow:\s*\/api\/\s*$/im);
  // /app/ must stay crawlable so Google can read its noindex (a Disallow would hide it)
  expect(robots).not.toMatch(/^Disallow:\s*\/app/im);
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  const cuerpo = await llms.text();
  expect(cuerpo.match(CUPO), "llms.txt states a class size").toBeNull();
  expect(cuerpo.match(GENERO), "llms.txt genders the teachers").toBeNull();
});
