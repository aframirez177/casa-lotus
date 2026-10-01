// (f) Security at the HTTP contract: roles, ownership, CSRF, what the public API leaks, account enumeration,
// and that signing out really ends the session on the server. API-only, so it runs once (in the «escritorio» project).
import { test, expect } from "../lib/prueba.js";
import { R, clienteApi, entrarApi, json, perfilCompleto, nombreNuevo, ACUERDOS } from "../lib/api.js";
import { CUENTAS, celular, ipUnica } from "../lib/entorno.js";

test.skip(({ isMobile }) => isMobile, "API checks: one run is enough");

/** A clienta session from Ana's private link (the same thing her phone does). */
async function sesionClienta(apiAdmin, idClienta) {
  const { enlace } = await apiAdmin.enlaceAcceso(idClienta);
  const token = new URL(enlace).pathname.split("/").pop();
  const api = await clienteApi();
  const r = await api.get(`/api/auth/enlace/${token}`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  expect(r.headers().location).toBe("/app/mi");
  return api;
}

test("una profe no entra a /api/admin/*", async () => {
  const profe = await entrarApi(CUENTAS.laura);
  for (const ruta of ["/api/admin/tablero", "/api/admin/clientas", "/api/admin/salud", "/api/admin/registro", "/api/admin/pagos", "/api/admin/whatsapp/estado"]) {
    const r = await profe.get(ruta);
    expect(r.status(), `GET ${ruta}`).toBe(403);
    expect(await r.json()).toMatchObject({ ok: false, error: "sin-permiso" });
  }
  for (const [ruta, data] of [["/api/admin/clases", { fecha: R.sumarDias(R.hoyClave(), 3), hora: "05:05", clase: "Yoga Aéreo", profe: "" }], ["/api/admin/pagos", { clienta: "C-0001", plan: "8 clases al mes", medio: "Nequi" }]]) {
    expect((await profe.post(ruta, { data })).status(), `POST ${ruta}`).toBe(403);
  }
  await profe.dispose();
});

test("una clienta no toca la reserva de otra", async ({ apiAdmin }) => {
  const fecha = R.sumarDias(R.hoyClave(), 4);
  const c = await apiAdmin.crearClase({ fecha, hora: await apiAdmin.horaLibre(fecha, { desde: "05:00", hasta: "06:55" }), profe: "Geral" });
  const [ella, otra] = [await apiAdmin.clientaConPlan("4 clases al mes", "Olga"), await apiAdmin.clientaConPlan("4 clases al mes", "Clara")];
  const suya = (await apiAdmin.reservar(otra.id, c.id)).reserva;
  const api = await sesionClienta(apiAdmin, ella.id);
  const yo = await json(await api.get("/api/yo"), 200);
  expect(yo.clienta.id).toBe(ella.id);
  expect(yo.proximas.map((r) => r.id)).not.toContain(suya.id);

  for (const [metodo, ruta, data] of [["post", `/api/yo/reservas/${suya.id}/cancelar`, {}], ["post", `/api/yo/reservas/${suya.id}/reagendar`, { clase: c.id }]]) {
    const r = await api[metodo](ruta, { data });
    expect([403, 404], `${ruta} → ${r.status()}`).toContain(r.status());
  }
  expect((await apiAdmin.clienta(otra.id)).reservas.find((r) => r.id === suya.id)?.estado, "her booking is untouched").toBe("Confirmada");
  // nor the staff API
  expect((await api.get("/api/admin/clientas")).status()).toBe(403);
  expect((await api.get("/api/profe/clases")).status()).toBe(403);
  await api.dispose();
});

test("sin X-Casa-Lotus (o desde otro origen) una escritura es 403", async () => {
  const sinCabecera = await clienteApi({ csrf: false });
  for (const [ruta, data] of [["/api/auth/entrar", { correo: CUENTAS.admin.correo, password: CUENTAS.admin.password }], ["/api/publico/espera", { clase: "2026-10-03 08:00", nombre: "QA", whatsapp: celular(), consentimientos: { datos: { acepta: true } } }], ["/api/auth/codigo", { whatsapp: celular() }]]) {
    const r = await sinCabecera.post(ruta, { data });
    expect(r.status(), `POST ${ruta} without the header`).toBe(403);
  }
  const ajeno = await clienteApi({ cabeceras: { Origin: "https://evil.example" } });
  expect((await ajeno.post("/api/auth/entrar", { data: { correo: CUENTAS.admin.correo, password: CUENTAS.admin.password } })).status(), "cross-origin").toBe(403);
  const cruzado = await clienteApi({ cabeceras: { "Sec-Fetch-Site": "cross-site" } });
  expect((await cruzado.post("/api/auth/codigo", { data: { whatsapp: celular() } })).status(), "Sec-Fetch-Site: cross-site").toBe(403);
  for (const x of [sinCabecera, ajeno, cruzado]) await x.dispose();
});

test("/api/publico/disponibilidad no dice nombres ni teléfonos", async ({ apiAdmin }) => {
  const api = await clienteApi();
  const r = await api.get("/api/publico/disponibilidad?dias=60");
  expect(r.status()).toBe(200);
  const texto = await r.text();
  const datos = JSON.parse(texto);
  expect(datos.clases.length).toBeGreaterThan(5);
  const claves = new Set();
  const recorrer = (o) => { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { claves.add(k); recorrer(v); } };
  recorrer(datos);
  for (const k of ["nombre", "whatsapp", "clienta", "gente", "espera", "salud", "correo", "profe", "notas"]) expect(claves.has(k), `key «${k}»`).toBe(false);
  expect(texto, "no phone numbers").not.toMatch(/\b(?:57)?3\d{9}\b|\b3\d{2} \d{3} \d{4}\b/);
  const gente = await apiAdmin.clientas();
  for (const c of gente) {
    expect(texto.includes(c.nombre), `name ${c.nombre}`).toBe(false);
    expect(texto.includes(c.whatsapp), `phone of ${c.nombre}`).toBe(false);
  }
  for (const ruta of ["/api/publico/estudio", "/api/publico/planes"]) {
    const t = await (await api.get(ruta)).text();
    for (const c of gente) expect(t.includes(c.nombre), `${ruta} leaks ${c.nombre}`).toBe(false);
  }
  await api.dispose();
});

test("POST /api/auth/codigo responde igual a un número real y a uno inventado", async ({ apiAdmin }) => {
  const real = await apiAdmin.crearClienta(perfilCompleto(nombreNuevo("Elisa")));
  const api = await clienteApi();
  const pedir = async (cuerpo) => { const r = await api.post("/api/auth/codigo", { data: cuerpo }); return { status: r.status(), cuerpo: await r.text(), tipo: r.headers()["content-type"] }; };
  const a = await pedir({ whatsapp: real.whatsapp.slice(2) });
  const b = await pedir({ whatsapp: celular() });
  expect(a.status).toBe(200);
  expect(b).toEqual(a);
  const c = await pedir({ correo: real.correo });
  const d = await pedir({ correo: `nadie.${Date.now()}@example.com` });
  expect(d).toEqual(c);
  await api.dispose();
});

test("una reserva web con un WhatsApp conocido no revela a la dueña", async ({ apiAdmin }) => {
  const duena = await apiAdmin.clientaConPlan("8 clases al mes", "Antonia");
  const fecha = R.sumarDias(R.hoyClave(), 5);
  const c = await apiAdmin.crearClase({ fecha, hora: await apiAdmin.horaLibre(fecha, { desde: "05:00", hasta: "06:55" }), profe: "Geral" });
  const reservar = async (whatsapp) => {
    const api = await clienteApi();
    const r = await api.post("/api/publico/reservas", { data: { clase: c.id, perfil: { nombre: "Otra Persona QA", whatsapp }, consentimientos: ACUERDOS, plan: "Clase de prueba", ref: "QA", website: "" } });
    return { api, status: r.status(), cuerpo: await r.json() };
  };
  const conocida = await reservar(duena.whatsapp.slice(2));
  const nueva = await reservar(celular());
  expect(conocida.status).toBe(201);
  expect(nueva.status).toBe(201);
  expect(Object.keys(conocida.cuerpo).sort()).toEqual(Object.keys(nueva.cuerpo).sort());
  expect(conocida.cuerpo.estado, "a public booking never spends her plan").toBe("Pendiente de pago");
  expect(JSON.stringify(conocida.cuerpo)).not.toContain(duena.nombre);
  const yo = await json(await conocida.api.get("/api/yo"), 200);
  expect(yo.limitada).toBe(true);
  expect(JSON.stringify(yo)).not.toContain(duena.nombre);
  expect(yo.saldo.clases).toBe(0);
  expect(yo.compras).toEqual([]);
  expect(yo.proximas.map((r) => r.id)).toEqual([conocida.cuerpo.codigo]);
  for (const x of [conocida, nueva]) await x.api.dispose();
});

test("cerrar sesión la termina en el servidor, no solo en la cookie", async () => {
  const api = await entrarApi(CUENTAS.admin);
  const cookie = (await api.storageState()).cookies.find((c) => c.name === "cl_sesion");
  expect(cookie, "session cookie").toBeTruthy();
  expect(cookie.httpOnly).toBe(true);
  expect((await api.get("/api/admin/tablero")).status()).toBe(200);
  expect((await api.post("/api/auth/salir")).status()).toBe(204);
  expect((await api.get("/api/auth/yo")).status()).toBe(401);
  // replaying the old cookie: the session must be dead server-side
  const viejo = await clienteApi({ cabeceras: { Cookie: `cl_sesion=${cookie.value}` } });
  expect((await viejo.get("/api/admin/tablero")).status()).toBe(401);
  expect((await viejo.get("/api/auth/yo")).status()).toBe(401);
  await viejo.dispose();
  await api.dispose();
});

test("límite de intentos de entrada (5 cada 15 min por correo e IP)", async () => {
  const ip = ipUnica();
  const api = await clienteApi({ ip });
  const estados = [];
  for (let i = 0; i < 6; i++) estados.push((await api.post("/api/auth/entrar", { data: { correo: CUENTAS.geral.correo, password: "no-es-la-clave" } })).status());
  expect(estados.slice(0, 5).every((s) => s === 401 || s === 422)).toBe(true);
  expect(estados[5]).toBe(429);
  // the right password is refused too while limited (no oracle)
  expect((await api.post("/api/auth/entrar", { data: { correo: CUENTAS.geral.correo, password: CUENTAS.geral.password } })).status()).toBe(429);
  await api.dispose();
});

test("la API responde con cabeceras seguras y noindex", async () => {
  const api = await clienteApi();
  const r = await api.get("/api/publico/planes");
  const h = r.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-robots-tag"]).toMatch(/noindex/);
  expect(h["content-security-policy"]).toMatch(/default-src 'none'/);
  expect(h["x-powered-by"]).toBeUndefined();
  await api.dispose();
});
