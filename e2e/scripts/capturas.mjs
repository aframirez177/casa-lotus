// Casa Lotus · visual review captures. Every route of the site and of the app (public, clienta, profe, admin),
// plus the key sheets and steps, at 375×812 and 1280×800, into e2e/capturas/ (gitignored).
// Tall pages are cut into tiles so each image stays readable. Needs the three dev servers (see README.md).
//   node scripts/capturas.mjs                 everything
//   node scripts/capturas.mjs sitio admin     only some groups (sitio, publico, clienta, profe, admin)
import { chromium, request } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as R from "../../shared/reglas.js";
import { SITIO, APP, API, APP_PROD, CUENTAS, ipUnica, celular } from "../lib/entorno.js";

const requerir = createRequire(new URL("../../site/package.json", import.meta.url));
const sharp = requerir("sharp");
const SALIDA = new URL("../capturas/", import.meta.url);
const grupos = process.argv.slice(2);
const quiero = (g) => !grupos.length || grupos.includes(g);

const VISTAS = {
  movil: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, alto: 1400 },
  escritorio: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, alto: 1600 },
};
const indice = [];

async function api(cuenta) {
  const ctx = await request.newContext({ baseURL: API, extraHTTPHeaders: { "X-Casa-Lotus": "1", "X-Forwarded-For": ipUnica() } });
  if (cuenta) {
    const r = await ctx.post("/api/auth/entrar", { data: { correo: cuenta.correo, password: cuenta.password } });
    if (r.status() !== 200) throw new Error("login " + cuenta.correo + " → " + r.status());
  }
  return ctx;
}
const leer = async (r) => { if (r.status() >= 300) throw new Error(r.url() + " → " + r.status() + " " + (await r.text())); return r.json(); };

/** Scrolls the whole page so scroll-triggered reveals run, then back to the top. */
async function recorrer(page) {
  await page.evaluate(async () => {
    const paso = Math.round(innerHeight * 0.6);
    for (let y = 0; y < document.documentElement.scrollHeight; y += paso) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 140)); }
    scrollTo(0, document.documentElement.scrollHeight); await new Promise((r) => setTimeout(r, 400));
    scrollTo(0, 0); await new Promise((r) => setTimeout(r, 700));
  });
}

async function capturar(page, grupo, vista, nombre, { completa = true, nota = "" } = {}) {
  const dir = new URL(`${grupo}/${vista}/`, SALIDA);
  await mkdir(dir, { recursive: true });
  await page.waitForTimeout(450);
  const buf = await page.screenshot({ fullPage: completa, animations: "disabled", caret: "hide" });
  const img = sharp(buf);
  const { width, height } = await img.metadata();
  const alto = VISTAS[vista].alto;
  const archivos = [];
  if (height <= alto * 1.15) {
    const f = new URL(`${nombre}.png`, dir);
    await writeFile(f, buf);
    archivos.push(f.pathname);
  } else {
    for (let y = 0, i = 1; y < height; y += alto, i++) {
      const f = new URL(`${nombre}-t${i}.png`, dir);
      await sharp(buf).extract({ left: 0, top: y, width, height: Math.min(alto, height - y) }).toFile(f.pathname);
      archivos.push(f.pathname);
    }
  }
  indice.push({ grupo, vista, nombre, url: page.url(), nota, archivos });
  process.stdout.write(`  ${grupo}/${vista}/${nombre} (${archivos.length})\n`);
}

async function contexto(browser, vista, estado) {
  const { alto, ...opciones } = VISTAS[vista];
  const ctx = await browser.newContext({ ...opciones, locale: "es-CO", timezoneId: "America/Bogota", storageState: estado });
  const ip = ipUnica();
  await ctx.route(/\/api\//, (r) => r.continue({ headers: { ...r.request().headers(), "x-forwarded-for": ip } }));
  return ctx;
}
const ir = async (page, url) => { await page.goto(url, { waitUntil: "load" }); await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}); };

const SITIO_RUTAS = [
  ["01-inicio", "/"], ["02-clases", "/clases/"], ["03-yoga-aereo", "/clases/yoga-aereo/"], ["04-pilates-aereo", "/clases/pilates-aereo/"],
  ["05-stretch-aereo", "/clases/stretch-aereo/"], ["06-multinivel", "/clases/yoga-aereo-multinivel/"], ["07-clase-de-prueba", "/clase-de-prueba/"],
  ["08-planes", "/planes/"], ["09-horarios", "/horarios/"], ["10-metodo-aereo", "/metodo-aereo/"], ["11-preguntas", "/preguntas/"],
  ["12-nosotros", "/nosotros/"], ["13-terminos", "/terminos/"], ["14-privacidad", "/privacidad/"], ["15-404", "/no-existe/"],
];

const browser = await chromium.launch({ channel: "chrome" });
for (const g of ["sitio", "publico", "clienta", "profe", "admin"]) if (quiero(g)) await rm(new URL(g + "/", SALIDA), { recursive: true, force: true });
const admin = await api(CUENTAS.admin);
const adminEstado = await admin.storageState();
const laura = await api(CUENTAS.laura);
const lauraEstado = await laura.storageState();

for (const vista of Object.keys(VISTAS)) {
  console.log(`\n${vista}`);

  if (quiero("sitio")) {
    const ctx = await contexto(browser, vista);
    const page = await ctx.newPage();
    for (const [nombre, ruta] of SITIO_RUTAS) {
      await ir(page, SITIO + ruta);
      await page.waitForTimeout(1600);
      await capturar(page, "sitio", vista, nombre + "-primera-vista", { completa: false });
      await recorrer(page);
      await capturar(page, "sitio", vista, nombre);
    }
    if (vista === "movil") {
      await ir(page, SITIO + "/");
      const menu = page.getByRole("button", { name: /menú|abrir/i }).first();
      if (await menu.isVisible().catch(() => false)) { await menu.click(); await capturar(page, "sitio", vista, "16-menu-movil", { completa: false }); }
    }
    await ctx.close();
  }

  if (quiero("publico")) {
    const ctx = await contexto(browser, vista);
    const page = await ctx.newPage();
    await ir(page, APP + "/app/entrar");
    await capturar(page, "publico", vista, "01-entrar");
    await page.getByRole("button", { name: /^Soy alumna/ }).click();
    await capturar(page, "publico", vista, "02-entrar-alumna");
    await page.goBack().catch(() => {});
    await ir(page, APP + "/app/entrar");
    await page.getByRole("button", { name: /^Equipo/ }).click();
    await capturar(page, "publico", vista, "03-entrar-equipo");
    await page.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
    await capturar(page, "publico", vista, "04-recuperar");
    for (const [n, r] of [["05-acceso-vencido", "/app/acceso/token-que-no-existe-0000000000"], ["06-invitacion-invalida", "/app/invitacion/token-que-no-existe-0000000000"], ["07-restablecer-invalido", "/app/restablecer/token-que-no-existe-0000000000"], ["08-no-existe", "/app/esto-no-existe"], ["09-entrar-enlace-vencido", "/app/entrar?enlace=vencido"]]) {
      await ir(page, APP + r);
      await page.waitForTimeout(1200);
      await capturar(page, "publico", vista, n);
    }
    // the booking flow, every step, through the site (attribution as from an ad)
    await ir(page, SITIO + "/clase-de-prueba/?utm_source=google&utm_medium=cpc&utm_campaign=prueba&gclid=CAPTURAS");
    await page.locator(".page-hero a.btn--primary").click();
    await page.waitForURL(/\/app\/reservar/);
    await page.waitForTimeout(1200);
    await capturar(page, "publico", vista, "10-reservar-clase-vacio");
    await page.locator("ul button[aria-pressed]").first().click();
    await capturar(page, "publico", vista, "11-reservar-clase-elegida");
    const seguir = () => page.getByRole("button", { name: /^(Continuar|Apartar|Apartar mi columpio)$/ }).filter({ visible: true }).first().click();
    await seguir();
    await capturar(page, "publico", vista, "12-reservar-tu");
    await seguir();
    await capturar(page, "publico", vista, "13-reservar-tu-errores");
    await page.getByLabel("Nombre y apellido").fill("Valeria Gómez");
    await page.getByLabel("WhatsApp", { exact: true }).fill(celular());
    await seguir();
    await capturar(page, "publico", vista, "14-reservar-ficha");
    await seguir();
    await capturar(page, "publico", vista, "15-reservar-ficha-errores");
    await page.getByRole("radio", { name: "Sí, quiero contarla" }).click();
    await page.getByLabel("Cuéntanos").fill("Me operaron la rodilla derecha hace un año.");
    await page.getByLabel("Nombre", { exact: true }).fill("Marta Gómez");
    await page.getByLabel("Su WhatsApp").fill(celular());
    await page.getByRole("radio", { name: "Primera vez" }).click();
    await seguir();
    await capturar(page, "publico", vista, "16-reservar-acuerdos");
    await seguir();
    await capturar(page, "publico", vista, "17-reservar-acuerdos-errores");
    await page.getByRole("button", { name: "Leer el texto completo" }).first().click();
    await page.getByRole("checkbox", { name: /Leí y acepto/ }).click();
    await page.getByRole("checkbox", { name: "Autorizo" }).first().click();
    await page.getByRole("checkbox", { name: "Autorizo" }).nth(1).click();
    await page.getByRole("radio", { name: "No quiero aparecer en fotos o videos" }).click();
    await capturar(page, "publico", vista, "18-reservar-acuerdos-llenos");
    await seguir();
    await page.getByRole("heading", { level: 1, name: /apartado|reservado/ }).waitFor();
    await page.waitForTimeout(1200);
    await capturar(page, "publico", vista, "19-reservar-listo");
    // the waiting list from the public picker (a full class, if any)
    await ir(page, APP + "/app/reservar?ref=CAPTURAS");
    await page.getByRole("button", { name: /^Reservar otra clase$/ }).click().catch(() => {});
    const llena = page.locator('[role="tab"][aria-label*="clases llenas"], [role="tab"][aria-label*="hay clases"]');
    for (const t of await llena.all()) {
      await t.click();
      const b = page.locator("ul button:not([aria-pressed])").filter({ hasText: /llena|espera/i }).first();
      if (await b.isVisible().catch(() => false)) { await b.click(); await capturar(page, "publico", vista, "20-lista-de-espera", { completa: false }); break; }
    }
    await ctx.close();
  }

  if (quiero("clienta")) {
    // Valentina (seed C-0001): a plan, upcoming classes, history
    const enlace = (await leer(await admin.post("/api/admin/clientas/C-0001/acceso"))).enlace;
    const ctx = await contexto(browser, vista);
    const page = await ctx.newPage();
    await ir(page, APP_PROD + new URL(enlace).pathname);
    await page.waitForURL(/\/app\/mi$/);
    for (const [n, r] of [["01-inicio", "/app/mi"], ["02-mis-clases", "/app/mi/clases"], ["04-reservar", "/app/mi/reservar"], ["06-perfil", "/app/mi/perfil"]]) {
      await ir(page, APP + r);
      await page.waitForTimeout(900);
      await capturar(page, "clienta", vista, n);
      if (n === "02-mis-clases") {
        await page.getByRole("tab", { name: /Historial/ }).click();
        await capturar(page, "clienta", vista, "03-mis-clases-historial");
      }
      if (n === "04-reservar") {
        const b = page.locator("ul button[aria-pressed]").first();
        if (await b.isVisible().catch(() => false)) { await b.click(); await capturar(page, "clienta", vista, "05-reservar-hoja", { completa: false }); }
      }
    }
    await ir(page, APP + "/app/mi");
    const proxima = page.getByRole("article", { name: "Tu próxima clase" });
    if (await proxima.isVisible().catch(() => false)) {
      await proxima.getByRole("button", { name: "Cancelar" }).click();
      await capturar(page, "clienta", vista, "07-hoja-cancelar", { completa: false });
      await page.getByRole("button", { name: "No, la mantengo" }).click();
      await proxima.getByRole("button", { name: "Reagendar" }).click();
      await capturar(page, "clienta", vista, "08-hoja-reagendar", { completa: false });
    }
    await ctx.close();
  }

  if (quiero("profe")) {
    const clases = await leer(await laura.get("/api/profe/clases"));
    const pasada = clases.find((c) => c.pasada && c.gente.length) || clases.find((c) => c.gente.length);
    const futura = clases.find((c) => !c.pasada && R.inicioClase(c) > Date.now() + 86400000);
    const ctx = await contexto(browser, vista, lauraEstado);
    const page = await ctx.newPage();
    await ir(page, APP + "/app/profe");
    await capturar(page, "profe", vista, "01-inicio");
    if (pasada) {
      await ir(page, APP + "/app/profe/clase/" + encodeURIComponent(pasada.id));
      await capturar(page, "profe", vista, "02-clase-por-marcar");
      const salud = page.getByRole("button", { name: "Salud" }).first();
      if (await salud.isVisible().catch(() => false)) { await salud.click(); await capturar(page, "profe", vista, "03-clase-salud-abierta"); }
      const agregar = page.getByRole("button", { name: "Agregar a alguien que vino" });
      if (await agregar.isVisible().catch(() => false)) {
        await agregar.click();
        await page.getByRole("searchbox", { name: "Buscar alumna" }).fill("an");
        await page.waitForTimeout(900);
        await capturar(page, "profe", vista, "04-hoja-agregar", { completa: false });
        await page.getByRole("button", { name: "Cerrar", exact: true }).click();
      }
    }
    if (futura) {
      await ir(page, APP + "/app/profe/clase/" + encodeURIComponent(futura.id));
      await capturar(page, "profe", vista, "05-clase-futura");
      await page.getByRole("button", { name: "No puedo dictar esta clase" }).click().catch(() => {});
      await capturar(page, "profe", vista, "06-hoja-reemplazo", { completa: false });
    }
    await ir(page, APP + "/app/profe/cuenta");
    await capturar(page, "profe", vista, "07-cuenta");
    await ctx.close();
  }

  if (quiero("admin")) {
    const agenda = await leer(await admin.get("/api/admin/agenda"));
    const conGente = agenda.find((c) => !c.pasada && c.gente.length >= 3) || agenda.find((c) => c.gente.length);
    const porMarcar = agenda.find((c) => c.pasada && c.gente.some((g) => g.estado === "Confirmada"));
    const ctx = await contexto(browser, vista, adminEstado);
    const page = await ctx.newPage();
    const rutas = [
      ["01-hoy", "/app/admin"], ["02-agenda", "/app/admin/agenda"], ["04-horario", "/app/admin/horario"], ["05-clientas", "/app/admin/clientas"],
      ["07-clienta", "/app/admin/clientas/C-0001"], ["08-mensajes", "/app/admin/mensajes"], ["09-pagos", "/app/admin/pagos"], ["10-equipo", "/app/admin/equipo"],
      ["11-ajustes", "/app/admin/ajustes"], ["12-cuenta", "/app/admin/cuenta"], ["13-registro", "/app/admin/registro"], ["14-resultados", "/app/admin/atribucion"],
    ];
    for (const [n, r] of rutas) {
      await ir(page, APP + r);
      await page.waitForTimeout(900);
      await capturar(page, "admin", vista, n);
    }
    if (conGente) { await ir(page, APP + "/app/admin/agenda/" + encodeURIComponent(conGente.id)); await capturar(page, "admin", vista, "03-clase-detalle"); }
    if (porMarcar) { await ir(page, APP + "/app/admin/agenda/" + encodeURIComponent(porMarcar.id)); await capturar(page, "admin", vista, "03b-clase-por-marcar"); }
    await ir(page, APP + "/app/admin/clientas?segmento=pendiente-pago");
    await capturar(page, "admin", vista, "06-clientas-segmento");
    // sheets
    await ir(page, APP + "/app/admin");
    const yaPago = page.getByRole("button", { name: /^(Ya pagó|Confirmar)$/ }).first();
    if (await yaPago.isVisible().catch(() => false)) { await yaPago.click(); await capturar(page, "admin", vista, "15-hoja-confirmar-pago", { completa: false }); await page.getByRole("button", { name: "Cerrar", exact: true }).click(); }
    await ir(page, APP + "/app/admin/agenda");
    await page.getByRole("button", { name: /^Agregar( una clase)?$/ }).filter({ visible: true }).first().click();
    await capturar(page, "admin", vista, "16-hoja-agregar", { completa: false });
    await page.getByRole("button", { name: /^Clase extra/ }).click();
    await capturar(page, "admin", vista, "17-hoja-clase-extra", { completa: false });
    await ir(page, APP + "/app/admin/horario");
    await page.getByRole("button", { name: "Nueva franja" }).click();
    await capturar(page, "admin", vista, "18-hoja-franja", { completa: false });
    if (conGente) {
      await ir(page, APP + "/app/admin/agenda/" + encodeURIComponent(conGente.id));
      await page.getByRole("button", { name: "Cancelar clase" }).click();
      await capturar(page, "admin", vista, "19-hoja-cancelar-clase", { completa: false });
      await page.getByRole("button", { name: "No, volver" }).click();
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      await capturar(page, "admin", vista, "20-hoja-editar-clase", { completa: false });
    }
    await ir(page, APP + "/app/admin/clientas/C-0001");
    await page.getByRole("button", { name: "Enlace de acceso" }).click();
    await page.getByRole("dialog", { name: "Enlace de acceso" }).waitFor();
    await capturar(page, "admin", vista, "21-hoja-enlace-acceso", { completa: false });
    await ir(page, APP + "/app/admin");
    await page.getByRole("button", { name: /^Novedades/ }).first().click().catch(() => {});
    await capturar(page, "admin", vista, "22-campana", { completa: false });
    await ctx.close();
  }
}

await writeFile(new URL(`indice-${grupos.join("-") || "todo"}.json`, SALIDA), JSON.stringify(indice, null, 2));
await browser.close();
for (const x of [admin, laura]) await x.dispose();
console.log(`\n${indice.length} capturas → ${SALIDA.pathname}`);
