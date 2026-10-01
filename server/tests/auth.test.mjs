// Accounts and sessions (CONTRATO §3): staff sign-in, rate limits, CSRF, roles, deactivation, clienta
// codes, access links, invitations, password resets and the limited session of a public booking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, reservaWeb, whatsappFalso, ADMIN, PROFE } from "./ayuda.mjs";
import { hashPassword, verificarPassword, passwordDebil } from "../src/auth/claves.js";

test("passwords: scrypt with salt, constant-time check, weak ones refused", async () => {
  const h1 = await hashPassword("una frase larga y rara");
  const h2 = await hashPassword("una frase larga y rara");
  assert.notEqual(h1, h2, "per-user salt");
  assert.match(h1, /^scrypt\$32768\$8\$3\$/);
  assert.equal(await verificarPassword("una frase larga y rara", h1), true);
  assert.equal(await verificarPassword("otra cosa", h1), false);
  assert.equal(await verificarPassword("lo que sea", null), false);
  assert.ok(passwordDebil("corta"));
  assert.ok(passwordDebil("1234567890"));
  assert.ok(passwordDebil("password123"));
  assert.ok(passwordDebil("ana.caona.2026", { correo: "ana.caona@example.com" }));
  assert.equal(passwordDebil("columpios al amanecer"), null);
});

test("staff sign-in: generic errors, rate limit, CSRF, roles, sessions, deactivation", async () => {
  const s = await arrancar();
  try {
    const c = s.cliente();
    const malo = await c.post("/api/auth/entrar", { correo: ADMIN.correo, password: "no-es-esta-clave" });
    const nadie = await c.post("/api/auth/entrar", { correo: "nadie@example.com", password: "no-es-esta-clave" });
    assert.equal(malo.status, 401);
    assert.equal(nadie.status, 401);
    assert.equal(malo.json.mensaje, nadie.json.mensaje, "never reveals whether the e-mail exists");
    assert.equal(malo.json.error, "no-autenticado");
    assert.equal((await c.get("/api/auth/yo")).status, 401);

    // 5 per 15 minutes per e-mail + IP
    for (let i = 0; i < 4; i++) await c.post("/api/auth/entrar", { correo: ADMIN.correo, password: "otra-mala-" + i });
    const bloqueado = await c.post("/api/auth/entrar", { correo: ADMIN.correo, password: ADMIN.password });
    assert.equal(bloqueado.status, 429);
    assert.equal(bloqueado.json.error, "limite");
    s.reloj.avanzar(16 * 60000);
    const yo = await entrarComo(c, ADMIN);
    assert.equal(yo.rol, "admin");
    assert.ok(!("hash" in yo));

    // CSRF: header required on every non-GET, foreign Origin refused
    const sinCabecera = await c.post("/api/admin/pagos", {}, { sinCsrf: true });
    assert.equal(sinCabecera.status, 403);
    assert.equal(sinCabecera.json.error, "sin-permiso");
    const otroOrigen = await c.post("/api/admin/pagos", {}, { cabeceras: { origin: "https://malo.example" } });
    assert.equal(otroOrigen.status, 403);
    const mismoOrigen = await c.post("/api/admin/pagos", {}, { cabeceras: { origin: "https://casalotus.studio" } });
    assert.equal(mismoOrigen.status, 422, "same origin passes CSRF and reaches validation");

    // cookie flags
    const r = await s.cliente().post("/api/auth/entrar", { correo: ADMIN.correo, password: ADMIN.password });
    const cookie = r.headers.getSetCookie().find((x) => x.startsWith("cl_sesion="));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);

    // roles: a profe is not an admin, a clienta is not a profe
    const profe = s.cliente();
    await entrarComo(profe, PROFE);
    assert.equal((await profe.get("/api/admin/tablero")).status, 403);
    assert.equal((await profe.get("/api/profe/clases")).status, 200);
    assert.equal((await c.get("/api/profe/clases")).status, 200, "admin ⊇ profe");
    const web = s.cliente();
    await web.post("/api/publico/reservas", reservaWeb("2026-10-07 18:00"));
    assert.equal((await web.get("/api/profe/clases")).status, 403);
    assert.equal((await web.get("/api/admin/clientas")).status, 403);

    // sessions: list, close others
    const ses = await c.get("/api/auth/sesiones");
    assert.ok(ses.json.length >= 2 && ses.json.some((x) => x.actual));
    assert.equal((await c.del("/api/auth/sesiones/otras")).status, 204);
    assert.equal((await c.get("/api/auth/sesiones")).json.length, 1);

    // deactivating a profe kills her open sessions at once
    const eq = await c.get("/api/admin/equipo");
    const idProfe = eq.json.find((u) => u.correo === PROFE.correo).id;
    const off = await c.patch("/api/admin/equipo/" + idProfe, { activa: false });
    assert.equal(off.json.activa, false);
    assert.equal((await profe.get("/api/profe/clases")).status, 401);
    assert.equal((await s.cliente().post("/api/auth/entrar", { correo: PROFE.correo, password: PROFE.password })).status, 401);
    // the last admin cannot remove herself
    const yoMismo = await c.patch("/api/admin/equipo/" + yo.id, { activa: false });
    assert.equal(yoMismo.status, 422);

    // sign out
    assert.equal((await c.post("/api/auth/salir")).status, 204);
    assert.equal((await c.get("/api/auth/yo")).status, 401);
  } finally {
    await s.cerrar();
  }
});

test("clienta code by e-mail (console driver), by WhatsApp when connected, and nothing reveals who exists", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const cr = await ana.post("/api/admin/clientas", { nombre: "Marta Díaz", whatsapp: "3155550099", correo: "marta@example.com" });
    assert.equal(cr.status, 201, cr.texto);

    const c = s.cliente();
    const pedido = await c.post("/api/auth/codigo", { correo: "Marta@Example.com" });
    assert.equal(pedido.status, 200);
    assert.deepEqual(pedido.json, { ok: true });
    const desconocido = await s.cliente().post("/api/auth/codigo", { correo: "nadie@example.com" });
    assert.equal(desconocido.texto, pedido.texto, "the exact same body for someone who does not exist");
    await s.ctx.esperarSegundoPlano();
    const correo = s.ctx.correo.buzon.find((m) => m.para === "marta@example.com");
    const codigo = correo.texto.match(/\b(\d{6})\b/)[1];
    assert.equal(s.ctx.correo.buzon.filter((m) => m.para === "nadie@example.com").length, 0);

    const malo = await c.post("/api/auth/verificar", { correo: "marta@example.com", codigo: codigo === "000000" ? "111111" : "000000" });
    assert.equal(malo.status, 422);
    const bien = await c.post("/api/auth/verificar", { correo: "marta@example.com", codigo });
    assert.equal(bien.status, 200, bien.texto);
    assert.equal(bien.json.usuario.clienta, cr.json.id);
    assert.equal(bien.json.usuario.limitada, false);
    assert.equal((await c.get("/api/yo")).json.clienta.perfil.nombre, "Marta Díaz");
    assert.equal((await s.cliente().post("/api/auth/verificar", { correo: "marta@example.com", codigo })).status, 422, "single use");

    // by WhatsApp number without the Meta API: her code goes to her e-mail; a stranger gets the same answer
    const antes = s.ctx.correo.buzon.length;
    const porWa = await s.cliente().post("/api/auth/codigo", { whatsapp: "315 555 0099" });
    const extrano = await s.cliente().post("/api/auth/codigo", { whatsapp: "315 555 0000" });
    assert.equal(porWa.texto, extrano.texto);
    assert.deepEqual(porWa.json, { ok: true });
    await s.ctx.esperarSegundoPlano();
    assert.equal(s.ctx.correo.buzon.length, antes + 1, "only the real clienta got an e-mail");
    const porWaCodigo = s.ctx.correo.buzon[s.ctx.correo.buzon.length - 1].texto.match(/\b(\d{6})\b/)[1];
    assert.equal((await s.cliente().post("/api/auth/verificar", { whatsapp: "3155550099", codigo: porWaCodigo })).status, 200, "verified with the number she typed");
    // rate limit: 3 per hour per destination
    await s.cliente().post("/api/auth/codigo", { whatsapp: "315 555 0099" });
    await s.cliente().post("/api/auth/codigo", { whatsapp: "315 555 0099" });
    assert.equal((await s.cliente().post("/api/auth/codigo", { whatsapp: "315 555 0099" })).status, 429);
  } finally {
    await s.cerrar();
  }

  const wa = whatsappFalso();
  const s2 = await arrancar({ whatsapp: wa });
  try {
    const ana = s2.cliente();
    await entrarComo(ana, ADMIN);
    await ana.post("/api/admin/clientas", { nombre: "Rosa Mar", whatsapp: "3155550098" });
    const a = await s2.cliente().post("/api/auth/codigo", { whatsapp: "3155550098" });
    const b = await s2.cliente().post("/api/auth/codigo", { whatsapp: "3155550097" });
    assert.equal(a.texto, b.texto, "same answer for a stranger");
    await s2.ctx.esperarSegundoPlano();
    assert.equal(wa.enviados.filter((m) => m.tipo === "codigo").length, 1);
    const c = s2.cliente();
    const v = await c.post("/api/auth/verificar", { whatsapp: "3155550098", codigo: wa.enviados.find((m) => m.tipo === "codigo").codigo });
    assert.equal(v.status, 200, v.texto);
  } finally {
    await s2.cerrar();
  }
});

test("access link (single use, previews do not burn it), invitation and password reset", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const cr = await ana.post("/api/admin/clientas", { nombre: "Lina Sol", whatsapp: "3155550097" });
    const acc = await ana.post("/api/admin/clientas/" + cr.json.id + "/acceso");
    assert.match(acc.json.enlace, /^https:\/\/casalotus\.studio\/app\/acceso\/[\w-]{40,}$/);
    assert.match(acc.json.waEnlace, /^https:\/\/wa\.me\/573155550097\?text=/);
    const token = acc.json.enlace.split("/").pop();
    const bot = await s.cliente().get("/api/auth/enlace/" + token, { cabeceras: { "user-agent": "WhatsApp/2.23.20.0" } });
    assert.equal(bot.status, 200);
    const ella = s.cliente();
    const uso = await ella.get("/api/auth/enlace/" + token);
    assert.equal(uso.status, 302);
    assert.equal(uso.headers.get("location"), "/app/mi");
    assert.equal((await ella.get("/api/auth/yo")).json.usuario.clienta, cr.json.id);
    const otraVez = await s.cliente().get("/api/auth/enlace/" + token);
    assert.equal(otraVez.headers.get("location"), "/app/entrar?enlace=vencido");

    // invitation → password → session
    const inv = await ana.post("/api/admin/equipo", { rol: "profe", nombre: "Geral Prueba", nombreHorario: "Geral", correo: "geral@example.com", whatsapp: "3155550096" });
    assert.equal(inv.status, 201, inv.texto);
    assert.match(inv.json.invitacion.waTexto, /equipo de Casa Lotus/);
    const tInv = inv.json.invitacion.enlace.split("/").pop();
    const ver = await s.cliente().get("/api/auth/invitacion/" + tInv);
    assert.deepEqual(ver.json, { nombre: "Geral Prueba", correo: "geral@example.com", rol: "profe" });
    const geral = s.cliente();
    assert.equal((await geral.post("/api/auth/invitacion/" + tInv, { password: "1234567890" })).status, 422);
    const acepto = await geral.post("/api/auth/invitacion/" + tInv, { password: "columpios al amanecer" });
    assert.equal(acepto.status, 200, acepto.texto);
    assert.equal(acepto.json.usuario.nombreHorario, "Geral");
    assert.ok((await geral.get("/api/profe/clases")).json.every((c) => c.profe === "Geral"));
    assert.equal((await s.cliente().post("/api/auth/invitacion/" + tInv, { password: "otra frase larga" })).status, 404);

    // reset: always 204; the link works once; the old password stops working
    assert.equal((await s.cliente().post("/api/auth/recuperar", { correo: "nadie@example.com" })).status, 204);
    assert.equal((await s.cliente().post("/api/auth/recuperar", { correo: "geral@example.com" })).status, 204);
    await s.ctx.esperarSegundoPlano();
    const m = s.ctx.correo.buzon.find((x) => x.para === "geral@example.com");
    assert.ok(m && !s.ctx.correo.buzon.some((x) => x.para === "nadie@example.com"));
    const tRes = m.texto.match(/\/app\/restablecer\/([\w-]+)/)[1];
    const nuevo = await s.cliente().post("/api/auth/restablecer", { token: tRes, nueva: "un columpio nuevo cada día" });
    assert.equal(nuevo.status, 200, nuevo.texto);
    assert.equal((await geral.get("/api/auth/yo")).status, 401, "a reset closes every other session");
    assert.equal((await s.cliente().post("/api/auth/entrar", { correo: "geral@example.com", password: "columpios al amanecer" })).status, 401);
    assert.equal((await s.cliente().post("/api/auth/entrar", { correo: "geral@example.com", password: "un columpio nuevo cada día" })).status, 200);
    assert.equal((await s.cliente().post("/api/auth/restablecer", { token: tRes, nueva: "otra frase larguísima" })).status, 404);

    // change password from the account
    const g = s.cliente();
    await g.post("/api/auth/entrar", { correo: "geral@example.com", password: "un columpio nuevo cada día" });
    assert.equal((await g.post("/api/auth/password", { actual: "mala", nueva: "otra frase larguísima" })).status, 422);
    assert.equal((await g.post("/api/auth/password", { actual: "un columpio nuevo cada día", nueva: "otra frase larguísima" })).status, 204);
    const cuenta = await g.patch("/api/auth/cuenta", { bio: "Profe de Stretch Aéreo." });
    assert.equal(cuenta.json.usuario.bio, "Profe de Stretch Aéreo.");
  } finally {
    await s.cerrar();
  }
});

test("a public booking with a known WhatsApp opens only a limited session", async () => {
  const s = await arrancar({ semilla: "demo" });
  try {
    // someone types Daniela's number (she has health data and a plan)
    const extrana = s.cliente();
    const r = await extrana.post("/api/publico/reservas", reservaWeb("2026-10-10 08:00", { nombre: "Alguien Más", whatsapp: "300 555 0103" }));
    assert.equal(r.status, 201, r.texto);
    assert.equal(r.json.estado, "Pendiente de pago", "her plan is never spent by a public booking");
    const yo = await extrana.get("/api/yo");
    assert.equal(yo.json.limitada, true);
    assert.equal(yo.json.clienta.perfil.nombre, "Alguien Más");
    assert.equal(yo.json.clienta.perfil.salud, "");
    assert.equal(yo.json.saldo.clases, 0);
    assert.deepEqual(yo.json.proximas.map((x) => x.id), [r.json.codigo]);
    assert.ok(!JSON.stringify(yo.json).includes("rodilla"));
    assert.ok(!JSON.stringify(yo.json).includes("Daniela"));
    assert.equal((await extrana.patch("/api/yo/perfil", { barrio: "X" })).status, 403);
    assert.equal((await extrana.post("/api/yo/reservas", { clase: "2026-10-10 09:15" })).status, 403);
    assert.equal((await extrana.get("/api/auth/yo")).json.usuario.limitada, true);
    // her profile was not overwritten
    const fila = s.datos._tablas.Clientas.filas.find((f) => f["ID"] === "C-0003");
    assert.equal(fila["Nombre"], "Daniela Mora");
    // the booking made from this device can still be cancelled from it
    const c = await extrana.post("/api/yo/reservas/" + r.json.codigo + "/cancelar");
    assert.equal(c.status, 200, c.texto);
    // but not Daniela's own bookings
    const suya = s.datos._tablas.Reservas.filas.find((f) => f["Clienta"] === "C-0003" && f["Estado"] === "Confirmada");
    assert.equal((await extrana.post("/api/yo/reservas/" + suya["ID"] + "/cancelar")).status, 404);
  } finally {
    await s.cerrar();
  }
});
