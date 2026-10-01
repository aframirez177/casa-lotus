// Casa Lotus e2e · the `test` every spec imports: a client IP per test (rate limits count per visitor, not per
// suite), console/page errors collected, and helpers to open a page already signed in as a staff member.
import { test as base, expect } from "@playwright/test";
import { ipUnica, CUENTAS, APP, APP_PROD } from "./entorno.js";
import { entrarApi, admin } from "./api.js";

/** Adds X-Forwarded-For to every /api request of a browser context (only those: no CORS side effects). */
export async function conIp(context, ip = ipUnica()) {
  await context.route(/\/api\//, (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }));
  return ip;
}

/** Collects console errors and uncaught exceptions of a page. */
export function vigilarErrores(page) {
  const errores = [];
  page.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text()} @ ${m.location()?.url || ""}`); });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  return errores;
}

export const test = base.extend({
  ip: async ({}, use) => { await use(ipUnica()); },
  context: async ({ context, ip }, use) => { await conIp(context, ip); await use(context); },
  errores: async ({ page }, use) => { await use(vigilarErrores(page)); },
  /** A signed-in admin API client (its own session, its own IP). */
  apiAdmin: async ({}, use) => {
    const api = await entrarApi(CUENTAS.admin);
    await use(admin(api));
    await api.dispose();
  },
  /**
   * Opens a new browser context signed in as a staff member (the session cookie comes from an API sign-in,
   * which is the same cookie the login form sets). Returns { context, page }.
   */
  comoStaff: async ({ browser, contextOptions }, use) => {
    const abiertos = [];
    await use(async (cuenta) => {
      const api = await entrarApi(cuenta);
      const estado = await api.storageState();
      await api.dispose();
      const context = await browser.newContext({ ...contextOptions, storageState: estado });
      await conIp(context);
      abiertos.push(context);
      const page = await context.newPage();
      return { context, page };
    });
    for (const c of abiertos) await c.close();
  },
});

export { expect };

/** The visible one of several matching elements (phones get a floating bar, desktops a side panel). */
export const visible = (locator) => locator.filter({ visible: true }).first();

/**
 * Opens Ana's private access link the way her phone does, on the production build (one request: the dev build's
 * StrictMode fires the redirect twice and burns the single-use link, see HALLAZGOS.md), then continues on the dev app.
 * Cookies on localhost are shared across ports, so the session carries over.
 */
export async function abrirEnlace(page, enlace) {
  await page.goto(APP_PROD + new URL(enlace).pathname);
  await expect(page).toHaveURL(/\/app\/mi$/);
  await page.goto(APP + "/app/mi");
}
