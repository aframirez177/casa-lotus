// E-mail through Resend (fake fetch, no network) and «Entrar con Google» for staff (fake verifier).
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, reservaWeb, ADMIN, PROFE } from "./ayuda.mjs";
import { crearCorreo } from "../src/notificaciones/correo.js";
import { leerConfig } from "../src/config.js";
import { NO_EN_EL_EQUIPO } from "../src/auth/google.js";

const CLAVE = "re_test_secreta_123456";

function fetchFalso(respuestas) {
  const llamadas = [];
  const f = async (url, o) => {
    llamadas.push({ url, ...o, cuerpo: JSON.parse(o.body) });
    const status = respuestas.length ? respuestas.shift() : 200;
    return { ok: status >= 200 && status < 300, status, json: async () => ({ id: "email_" + llamadas.length }) };
  };
  f.llamadas = llamadas;
  return f;
}

function logFalso() {
  const lineas = [];
  const l = (n) => (msg, campos) => lineas.push(n + " " + msg + " " + JSON.stringify(campos || {}));
  return { lineas, debug: l("debug"), info: l("info"), warn: l("warn"), error: l("error") };
}

const config = (extra = {}) => leerConfig({ NODE_ENV: "test", CORREO_DRIVER: "resend", RESEND_API_KEY: CLAVE, ...extra });

test("Resend: from reservas@casalotus.studio, Reply-To the studio, one retry on 5xx/429, no secrets in logs", async () => {
  const log = logFalso();
  const f = fetchFalso([500, 200]);
  const c = crearCorreo(config(), log, { fetch: f });
  assert.equal(c.driver, "resend");
  assert.equal(c.remitente, "reservas@casalotus.studio");
  assert.equal(await c.enviar({ para: "ana.caona@example.com", asunto: "Hola", html: "<p>Hola</p>", texto: "Hola", nombreRemitente: "Casa Lotus · Reservas" }), true);
  assert.equal(f.llamadas.length, 2, "retried once after a 500");
  const l = f.llamadas[1];
  assert.equal(l.url, "https://api.resend.com/emails");
  assert.equal(l.method, "POST");
  assert.equal(l.headers.Authorization, "Bearer " + CLAVE);
  assert.deepEqual(l.cuerpo, {
    from: "Casa Lotus · Reservas <reservas@casalotus.studio>", to: ["ana.caona@example.com"], subject: "Hola", html: "<p>Hola</p>", text: "Hola",
    reply_to: "casalotusbogota@gmail.com",
  });
  const todo = log.lineas.join("\n");
  assert.ok(!todo.includes(CLAVE), "the API key never reaches the logs");
  assert.ok(!todo.includes("ana.caona@"), "nor a full address");

  const f429 = fetchFalso([429, 429]);
  await assert.rejects(crearCorreo(config(), logFalso(), { fetch: f429 }).enviar({ para: "x@example.com", asunto: "a", html: "", texto: "" }), /429/);
  assert.equal(f429.llamadas.length, 2);
  const f400 = fetchFalso([422]);
  await assert.rejects(crearCorreo(config(), logFalso(), { fetch: f400 }).enviar({ para: "x@example.com", asunto: "a", html: "", texto: "" }), /422/);
  assert.equal(f400.llamadas.length, 1, "a client error is not retried");
  const sinClave = crearCorreo(leerConfig({ NODE_ENV: "test", CORREO_DRIVER: "resend" }), logFalso(), { fetch: fetchFalso([]) });
  assert.equal(sinClave.activo, false);
  assert.equal(await sinClave.enviar({ para: "x@example.com", asunto: "a", html: "", texto: "" }), false);
  assert.equal(leerConfig({ NODE_ENV: "test", RESEND_API_KEY: CLAVE }).correo.driver, "resend", "a key alone selects Resend");
});

test("a web booking e-mails Ana through Resend with the hosted logo; salud reports the sender", async () => {
  const f = fetchFalso([]);
  const s = await arrancar({ env: { CORREO_DRIVER: "resend", RESEND_API_KEY: CLAVE }, fetchCorreo: f });
  try {
    assert.equal((await s.cliente().post("/api/publico/reservas", reservaWeb("2026-10-03 08:00"))).status, 201);
    await s.ctx.esperarSegundoPlano();
    assert.equal(f.llamadas.length, 1);
    const m = f.llamadas[0].cuerpo;
    assert.deepEqual(m.to, ["casalotusbogota@gmail.com"], "«Correo para avisos»");
    assert.equal(m.from, "Casa Lotus · Reservas <reservas@casalotus.studio>");
    assert.match(m.html, /src="https:\/\/casalotus\.studio\/apple-touch-icon\.png"/);
    assert.ok(!m.html.includes("cid:"));
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const sal = (await ana.get("/api/admin/salud")).json;
    assert.deepEqual(sal.correo, { driver: "resend", remitente: "reservas@casalotus.studio", ok: true });
  } finally {
    await s.cerrar();
  }
});

const CLIENTE = "1234567890-abc.apps.googleusercontent.com";
/** A fake verifier: the «credential» is a key into these payloads. */
function googleFalso(extra = {}) {
  const base = (email, o = {}) => ({ iss: "https://accounts.google.com", aud: CLIENTE, email, email_verified: true, sub: "g-" + email, name: "Nombre", ...o });
  const tokens = {
    "token-admin-xxxxxxxxxxxx": base(ADMIN.correo.toUpperCase()),
    "token-profe-xxxxxxxxxxxx": base(PROFE.correo),
    "token-extrano-xxxxxxxxxx": base("extrano@example.com"),
    "token-sinverificar-xxxxx": base(ADMIN.correo, { email_verified: false }),
    "token-otroemisor-xxxxxxx": base(ADMIN.correo, { iss: "https://malo.example" }),
    "token-otraaudiencia-xxxx": base(ADMIN.correo, { aud: "otra.apps.googleusercontent.com" }),
    "token-invitada-xxxxxxxxx": base("nueva.profe@example.com"),
    ...extra,
  };
  return { clientId: CLIENTE, async verificar(t) { if (!tokens[t]) throw new Error("firma inválida"); return tokens[t]; } };
}

test("Entrar con Google: only active staff, verified and for this app; same session as the password login", async () => {
  const sinGoogle = await arrancar();
  try {
    assert.deepEqual((await sinGoogle.cliente().get("/api/auth/config")).json, { google: null });
    assert.equal((await sinGoogle.cliente().post("/api/auth/google", { credential: "token-admin-xxxxxxxxxxxx" })).status, 503);
  } finally {
    await sinGoogle.cerrar();
  }

  const s = await arrancar({ google: googleFalso() });
  try {
    assert.deepEqual((await s.cliente().get("/api/auth/config")).json, { google: { clientId: CLIENTE } });
    const ana = s.cliente();
    const r = await ana.post("/api/auth/google", { credential: "token-admin-xxxxxxxxxxxx" });
    assert.equal(r.status, 200, r.texto);
    assert.equal(r.json.usuario.rol, "admin");
    assert.match(r.headers.getSetCookie().find((x) => x.startsWith("cl_sesion=")), /HttpOnly/);
    assert.equal((await ana.get("/api/admin/tablero")).status, 200);
    const reg = (await ana.get("/api/admin/registro?limite=5")).json;
    assert.ok(reg.some((x) => x.accion === "auth.entrar-google" && x.detalle.texto === "Entró con Google"));

    const extrano = await s.cliente().post("/api/auth/google", { credential: "token-extrano-xxxxxxxxxx" });
    assert.equal(extrano.status, 403);
    assert.equal(extrano.json.mensaje, NO_EN_EL_EQUIPO);
    for (const t of ["token-sinverificar-xxxxx", "token-otroemisor-xxxxxxx", "token-otraaudiencia-xxxx", "token-falso-xxxxxxxxxxxx"]) {
      const x = await s.cliente().post("/api/auth/google", { credential: t });
      assert.equal(x.status, 401, t);
      assert.equal(x.json.error, "no-autenticado");
    }
    // a deactivated profe cannot come back through Google
    const eq = (await ana.get("/api/admin/equipo")).json;
    await ana.patch("/api/admin/equipo/" + eq.find((u) => u.correo === PROFE.correo).id, { activa: false });
    assert.equal((await s.cliente().post("/api/auth/google", { credential: "token-profe-xxxxxxxxxxxx" })).json.mensaje, NO_EN_EL_EQUIPO);
    // rate limited like the password login (5 per 15 min per e-mail + IP)
    for (let i = 0; i < 3; i++) await s.cliente().post("/api/auth/google", { credential: "token-extrano-xxxxxxxxxx" });
    assert.equal((await s.cliente().post("/api/auth/google", { credential: "token-extrano-xxxxxxxxxx" })).status, 403);
    assert.equal((await s.cliente().post("/api/auth/google", { credential: "token-extrano-xxxxxxxxxx" })).status, 429);
  } finally {
    await s.cerrar();
  }
});

test("an invitation can be accepted with Google when the e-mails match (no password needed)", async () => {
  const s = await arrancar({ google: googleFalso({ "token-otra-xxxxxxxxxxxxxx": { iss: "accounts.google.com", aud: CLIENTE, email: "otra@example.com", email_verified: true } }) });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const inv = await ana.post("/api/admin/equipo", { rol: "profe", nombre: "Nueva Profe", correo: "Nueva.Profe@example.com" });
    const token = inv.json.invitacion.enlace.split("/").pop();
    const otra = await s.cliente().post("/api/auth/invitacion/" + token + "/google", { credential: "token-otra-xxxxxxxxxxxxxx" });
    assert.equal(otra.status, 403);
    assert.match(otra.json.mensaje, /Esta invitación es para nueva\.profe@example\.com/);
    const ella = s.cliente();
    const ok = await ella.post("/api/auth/invitacion/" + token + "/google", { credential: "token-invitada-xxxxxxxxx" });
    assert.equal(ok.status, 200, ok.texto);
    assert.equal(ok.json.usuario.rol, "profe");
    assert.equal((await ella.get("/api/profe/resumen")).status, 200);
    assert.equal((await s.cliente().post("/api/auth/invitacion/" + token + "/google", { credential: "token-invitada-xxxxxxxxx" })).status, 404, "single use");
    // no password was set: the password login cannot open it, Google can
    assert.equal((await s.cliente().post("/api/auth/entrar", { correo: "nueva.profe@example.com", password: "cualquier frase larga" })).status, 401);
    assert.equal((await s.cliente().post("/api/auth/google", { credential: "token-invitada-xxxxxxxxx" })).status, 200);
  } finally {
    await s.cerrar();
  }
});
