// (g) The installable app: a valid web manifest (served by the site, shared by the app) and a service worker
// that the production build registers under /app/ (the dev server never does: devOptions.enabled = false).
import { test, expect } from "../lib/prueba.js";
import { SITIO, APP_PROD } from "../lib/entorno.js";
import { PNG } from "../lib/png.js";

test("manifest.webmanifest: nombre, íconos 192/512/maskable, start_url /app/, standalone", async ({ request }) => {
  const r = await request.get(SITIO + "/manifest.webmanifest");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toMatch(/application\/(manifest\+)?json/);
  const m = await r.json();
  expect(m.name).toBe("Casa Lotus");
  expect(m.short_name.length).toBeLessThanOrEqual(12);
  expect(m.start_url).toMatch(/^\/app\//);
  expect(m.display).toBe("standalone");
  expect(m.lang).toBe("es-CO");
  expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  const scope = new URL(m.scope || "/", SITIO).pathname;
  expect(new URL(m.start_url, SITIO).pathname.startsWith(scope), "start_url inside scope").toBe(true);

  const icono = (tam, proposito) => m.icons.find((i) => i.sizes === tam && (i.purpose || "any").split(" ").includes(proposito));
  for (const [tam, proposito] of [["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]]) {
    const i = icono(tam, proposito);
    expect(i, `icon ${tam} ${proposito}`).toBeTruthy();
    const img = await request.get(new URL(i.src, SITIO).href);
    expect(img.status(), i.src).toBe(200);
    const { ancho, alto } = PNG.medidas(await img.body());
    expect(`${ancho}x${alto}`, `${i.src} real size`).toBe(tam);
  }
  for (const s of m.shortcuts || []) expect(s.url).toMatch(/^\/app\//);
});

test("el sitio y el build de la app enlazan /manifest.webmanifest", async ({ page }) => {
  for (const url of [SITIO + "/", APP_PROD + "/app/entrar"]) {
    await page.goto(url);
    await expect(page.locator('link[rel="manifest"]'), url).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  }
});

test("en desarrollo, el manifest que enlaza la app es un manifest (no la página)", async ({ page, request }) => {
  await page.goto("/app/entrar");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const r = await request.get(new URL(href, page.url()).href);
  expect.soft(r.headers()["content-type"], `dev app links ${href}`).toMatch(/json/);
});

test("el build de producción registra el service worker con alcance /app/", async ({ page }) => {
  await page.goto(APP_PROD + "/app/entrar");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const sw = await page.evaluate(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error("no service worker after 20 s")), 20000))]);
    return { scope: reg.scope, script: reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL };
  });
  expect(new URL(sw.scope).pathname).toBe("/app/");
  expect(new URL(sw.script).pathname).toBe("/app/sw.js");
  // the app shell comes back offline
  await page.reload();
  await page.context().setOffline(true);
  await page.goto(APP_PROD + "/app/entrar").catch(() => {});
  await expect(page.getByRole("heading", { level: 1 }), "the shell loads offline from the precache").toBeVisible();
  await page.context().setOffline(false);
});
