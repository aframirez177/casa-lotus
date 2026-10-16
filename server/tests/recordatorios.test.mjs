// Class reminders: the day before at «Hora del recordatorio», by e-mail (and WhatsApp when connected), once per
// booking; «No puedo ir» opens a session for that booking only; «No quiero recordatorios» tags her.
// The clock starts on Thursday 1 October 2026, 10:00 (Bogotá).
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, whatsappFalso, ADMIN } from "./ayuda.mjs";
import { enviarRecordatorios, horaRecordatorio, ventanaRecordatorio } from "../src/dominio/recordatorios.js";
import { tareaFrecuente } from "../src/tareas/index.js";

const SAB_0800 = "2026-10-03 08:00"; // Stretch Aéreo · Geral
const SAB_0915 = "2026-10-03 09:15"; // Yoga Aéreo multinivel · Ximena
const en = (iso) => Date.parse(iso + "-05:00");

async function nuevaClienta(ana, { nombre, whatsapp, correo = "", plan = "8 clases al mes", novedades = false }) {
  const c = await ana.post("/api/admin/clientas", {
    nombre, whatsapp, correo, salud: "Ninguna", contactoEmergencia: { nombre: "Mamá", whatsapp: "3005559999" },
    consentimientos: { datos: { acepta: true }, descargo: { acepta: true }, imagen: { acepta: true }, ...(novedades ? { novedades: { acepta: true } } : {}) },
  });
  assert.equal(c.status, 201, c.texto);
  if (plan) assert.equal((await ana.post("/api/admin/pagos", { clienta: c.json.id, plan, medio: "Nequi" })).status, 201);
  return c.json.id;
}

async function reservar(ana, clienta, clase) {
  const r = await ana.post("/api/admin/reservas", { clienta, clase });
  assert.equal(r.status, 201, r.texto);
  return r.json.reserva.id;
}

const correosA = (s, para) => s.ctx.correo.buzon.filter((m) => m.para === para && /^Mañana tienes clase/.test(m.asunto));
/** The path of a link in a reminder (the e-mails carry https://casalotus.studio/...). */
const ruta = (texto, etiqueta) => texto.match(new RegExp(etiqueta + ": https://casalotus\\.studio(\\S+)"))[1];

test("the day before at 18:00: one reminder per active booking, with the rule, the links and the fijo", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const paula = await nuevaClienta(ana, { nombre: "Paula Ríos", whatsapp: "3155550501", correo: "paula@example.com" });
    const vale = await nuevaClienta(ana, { nombre: "Valentina Ruiz", whatsapp: "3155550502", correo: "vale@example.com" });
    const cami = await nuevaClienta(ana, { nombre: "Camila Torres", whatsapp: "3155550503", correo: "cami@example.com", plan: null });
    const lucia = await nuevaClienta(ana, { nombre: "Lucía Gómez", whatsapp: "3155550504", correo: "lucia@example.com" });
    const sofia = await nuevaClienta(ana, { nombre: "Sofía Pardo", whatsapp: "3155550505", correo: "" });
    const dana = await nuevaClienta(ana, { nombre: "Daniela Mora", whatsapp: "3155550506", correo: "dani@example.com" });
    const rPaula = await reservar(ana, paula, SAB_0800);
    await ana.post("/api/admin/fijos", { clienta: vale, dia: "Sábado", hora: "09:15" }); // a fijo, on her plan
    await ana.post("/api/admin/fijos", { clienta: cami, dia: "Sábado", hora: "08:00" }); // a fijo without a plan: pending
    await reservar(ana, lucia, SAB_0800);
    assert.equal((await ana.patch("/api/admin/clientas/" + lucia, { recordatorios: false })).status, 200);
    await reservar(ana, sofia, SAB_0800); // no e-mail, no WhatsApp: nothing to send
    const rDana = await reservar(ana, dana, SAB_0915);
    await ana.post("/api/admin/reservas/" + rDana + "/cancelar", {});
    // booked on Friday morning, less than 24 h before: her confirmation is enough
    s.reloj.fijar(en("2026-10-02T09:00:00"));
    const tarde = await nuevaClienta(ana, { nombre: "Andrea Castillo", whatsapp: "3155550507", correo: "andrea@example.com" });
    await reservar(ana, tarde, SAB_0800);
    await s.ctx.esperarSegundoPlano();
    s.ctx.correo.buzon.length = 0;

    s.reloj.fijar(en("2026-10-02T17:55:00"));
    assert.deepEqual(await enviarRecordatorios(s.ctx), { enviados: 0, correos: 0, whatsapps: 0 }, "not yet");
    s.reloj.fijar(en("2026-10-02T18:05:00"));
    await tareaFrecuente(s.ctx); // the scheduler's own entry point
    await s.ctx.esperarSegundoPlano();
    const para = s.ctx.correo.buzon.filter((m) => /^Mañana tienes clase/.test(m.asunto)).map((m) => m.para).sort();
    assert.deepEqual(para, ["cami@example.com", "paula@example.com", "vale@example.com"]);
    assert.deepEqual(await enviarRecordatorios(s.ctx), { enviados: 0, correos: 0, whatsapps: 0 }, "never twice");
    const filas = s.ctx.db.prepare("SELECT reserva, canales FROM recordatorios ORDER BY reserva").all();
    assert.equal(filas.length, 3);
    assert.ok(filas.every((f) => f.canales === "correo"));

    // Paula: confirmed on her plan
    const m = correosA(s, "paula@example.com")[0];
    assert.equal(m.asunto, "Mañana tienes clase en Casa Lotus · sábado 8:00 a. m.");
    assert.match(m.texto, /Stretch Aéreo\nsábado 3 de octubre\n8:00 a\. m\. – 9:00 a\. m\.\nCon tu profe Geral/);
    assert.match(m.texto, /Si no puedes venir, cancela antes del sábado a las 2:00 a\. m\. y la clase vuelve a tu plan\./);
    assert.match(m.texto, /Agregar a Google Calendar: https:\/\/calendar\.google\.com\//);
    assert.match(m.html, />No puedo ir</);
    assert.match(m.html, />No quiero recordatorios</);
    assert.doesNotMatch(m.texto, /clase fija|falta el pago/);
    assert.doesNotMatch(m.html, /Calle|Carrera|Dirección/i, "the address is not public yet");
    // Valentina: her fijo
    assert.match(correosA(s, "vale@example.com")[0].texto, /Es tu clase fija de los sábados\./);
    // Camila: a fijo held without a plan, with the payment instructions and no deadline
    const c = correosA(s, "cami@example.com")[0];
    assert.match(c.texto, /Tu cupo está apartado y falta el pago: paga \$\d[\d.]* por Nequi, DaviPlata o Bre-B a la llave 319 328 8469 y envía el comprobante al WhatsApp 312 872 0888\./);
    assert.match(c.texto, /cancélala para liberar el cupo/);

    // «No puedo ir»: a session for that booking only, until the class starts
    const ella = s.cliente();
    const r = await ella.get(ruta(m.texto, "No puedo ir"));
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), "/app/mi/clases?reserva=" + rPaula + "&accion=cancelar");
    assert.ok(ella.cookie);
    const yo = (await ella.get("/api/yo")).json;
    assert.equal(yo.limitada, true);
    assert.deepEqual(yo.proximas.map((x) => x.id), [rPaula]);
    assert.equal(yo.clienta.tieneCorreo, true);
    assert.equal((await ella.post("/api/yo/reservas", { clase: "2026-10-07 18:00" })).status, 403, "she cannot book from it");
    const otra = s.datos._tablas.Reservas.filas.find((f) => f["Clienta"] === vale)["ID"];
    assert.equal((await ella.post("/api/yo/reservas/" + otra + "/cancelar")).status, 404, "nobody else's booking");
    const cancel = await ella.post("/api/yo/reservas/" + rPaula + "/cancelar");
    assert.equal(cancel.status, 200, cancel.texto);
    assert.deepEqual([cancel.json.reserva.estado, cancel.json.devolvioClase], ["Cancelada", true]);
    await s.ctx.esperarSegundoPlano();
    assert.ok(s.ctx.correo.buzon.some((x) => x.para === "paula@example.com" && /^Cancelamos tu clase/.test(x.asunto)), "the cancellation e-mail goes to her");
    s.reloj.fijar(en("2026-10-03T08:00:00"));
    assert.equal((await ella.get("/api/yo")).status, 401, "the session ends when the class starts");

    // Camila moves her held fijo class from her reminder: the session follows it, and the hold still never expires
    s.reloj.fijar(en("2026-10-02T18:10:00"));
    const cSesion = s.cliente();
    await cSesion.get(ruta(c.texto, "No puedo ir"));
    const suya = (await cSesion.get("/api/yo")).json.proximas[0];
    const mov = await cSesion.post("/api/yo/reservas/" + suya.id + "/reagendar", { clase: "2026-10-07 18:00" });
    assert.equal(mov.status, 200, mov.texto);
    assert.deepEqual([mov.json.nueva.estado, mov.json.nueva.pago.venceApartado], ["Pendiente de pago", null]);
    assert.equal(s.datos._tablas.Reservas.filas.find((f) => f["ID"] === mov.json.nueva.id)["Origen"], "Cupo fijo · F-0002", "still her fijo's");
    s.reloj.fijar(en("2026-10-03T08:30:00"));
    assert.deepEqual((await cSesion.get("/api/yo")).json.proximas.map((x) => x.id), [mov.json.nueva.id]);

    // someone already signed in as her keeps her full session; a dead link goes to the sign-in screen
    s.reloj.fijar(en("2026-10-02T18:10:00"));
    const acceso = await ana.post("/api/admin/clientas/" + vale + "/acceso");
    const vSesion = s.cliente();
    await vSesion.get("/api/auth/enlace/" + acceso.json.enlace.split("/").pop());
    const antes = vSesion.cookie;
    const v = await vSesion.get(ruta(correosA(s, "vale@example.com")[0].texto, "No puedo ir"));
    assert.equal(v.status, 302);
    assert.equal(vSesion.cookie, antes);
    assert.equal((await vSesion.get("/api/yo")).json.limitada, false);
    const muerto = await s.cliente().get("/api/auth/reserva/" + "x".repeat(43));
    assert.equal(muerto.headers.get("location"), "/app/entrar?enlace=vencido");
    const bot = s.cliente();
    const vista = await bot.get(ruta(m.texto, "No puedo ir"), { cabeceras: { "user-agent": "WhatsApp/2.23" } });
    assert.equal(vista.status, 200);
    assert.equal(bot.cookie, "", "a link preview opens no session");
  } finally {
    await s.cerrar();
  }
});

test("«No quiero recordatorios» tags her; she turns them back on from her profile", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const paula = await nuevaClienta(ana, { nombre: "Paula Ríos", whatsapp: "3155550501", correo: "paula@example.com" });
    await reservar(ana, paula, SAB_0800);
    await reservar(ana, paula, "2026-10-10 08:00");
    s.reloj.fijar(en("2026-10-02T18:00:00"));
    await enviarRecordatorios(s.ctx);
    const m = correosA(s, "paula@example.com")[0];

    const dirBaja = ruta(m.texto, "No quiero recordatorios");
    // RFC 8058 headers on the reminder
    assert.deepEqual(m.cabeceras, { "List-Unsubscribe": "<https://casalotus.studio" + dirBaja + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });

    // a GET (her click, or a link scanner) only asks: nothing changes
    const pregunta = await s.cliente().get(dirBaja);
    assert.equal(pregunta.status, 200);
    assert.match(pregunta.headers.get("content-type"), /text\/html/);
    assert.match(pregunta.texto, /<form method="post" action="\/api\/publico\/recordatorios\/baja\/[^"]+"/);
    assert.match(pregunta.texto, /Sí, no quiero recordatorios/);
    assert.match(pregunta.headers.get("content-security-policy"), /form-action 'self'/);
    assert.equal((await ana.get("/api/admin/clientas/" + paula)).json.perfil.recordatorios, true, "a GET never unsubscribes");

    // the button POSTs the form (no CSRF header possible from a plain form)
    const form = (cuerpo) => fetch(s.base + dirBaja, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: cuerpo });
    let r = await form("accion=baja");
    assert.equal(r.status, 200);
    let html = await r.text();
    assert.match(html, /no te enviaremos más recordatorios/);
    assert.match(html, /name="accion" value="volver"/);
    const det = (await ana.get("/api/admin/clientas/" + paula)).json;
    assert.ok(det.etiquetas.includes("sin-recordatorios"), "Ana sees it as a tag");
    assert.equal(det.perfil.recordatorios, false);
    // «Volver a recibirlos» undoes it
    r = await form("accion=volver");
    assert.match(await r.text(), /Volverás a recibir tus recordatorios/);
    assert.equal((await ana.get("/api/admin/clientas/" + paula)).json.perfil.recordatorios, true);
    // a mail client's one-click (RFC 8058) works without the button
    r = await form("List-Unsubscribe=One-Click");
    assert.equal(r.status, 200);
    assert.equal((await ana.get("/api/admin/clientas/" + paula)).json.perfil.recordatorios, false);
    assert.equal((await form("List-Unsubscribe=One-Click")).status, 200, "a second click is harmless");
    // a dead link: nothing to do, on GET or POST
    assert.equal((await s.cliente().get("/api/publico/recordatorios/baja/" + "y".repeat(43))).status, 404);
    assert.equal((await fetch(s.base + "/api/publico/recordatorios/baja/" + "y".repeat(43), { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } })).status, 404);
    const reg = (await ana.get("/api/admin/registro?limite=30")).json.map((x) => x.accion);
    assert.ok(reg.includes("recordatorios.baja") && reg.includes("recordatorios.alta"));

    // the next week: nothing for her
    s.reloj.fijar(en("2026-10-09T18:30:00"));
    assert.equal((await enviarRecordatorios(s.ctx)).enviados, 0);

    // she turns them back on in her profile
    const acceso = await ana.post("/api/admin/clientas/" + paula + "/acceso");
    const ella = s.cliente();
    await ella.get("/api/auth/enlace/" + acceso.json.enlace.split("/").pop());
    let yo = (await ella.get("/api/yo")).json;
    assert.deepEqual([yo.clienta.perfil.recordatorios, yo.clienta.tieneCorreo], [false, true]);
    const on = await ella.patch("/api/yo/perfil", { recordatorios: true });
    assert.equal(on.status, 200, on.texto);
    assert.equal(on.json.perfil.recordatorios, true);
    assert.ok(!(await ana.get("/api/admin/clientas/" + paula)).json.etiquetas.includes("sin-recordatorios"));
    assert.equal((await enviarRecordatorios(s.ctx)).enviados, 1, "the 10th's reminder goes out (still inside its window)");
    yo = (await ella.get("/api/yo")).json;
    assert.equal(yo.clienta.perfil.recordatorios, true);
  } finally {
    await s.cerrar();
  }
});

test("a restart catches up for 4 hours, never later; the hour is a setting", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const paula = await nuevaClienta(ana, { nombre: "Paula Ríos", whatsapp: "3155550501", correo: "paula@example.com" });
    await reservar(ana, paula, "2026-10-07 18:00");
    await reservar(ana, paula, "2026-10-10 08:00");
    // the server was down all Tuesday evening: at 22:05 the Wednesday reminder is not sent any more
    s.reloj.fijar(en("2026-10-06T22:05:00"));
    assert.equal((await enviarRecordatorios(s.ctx)).enviados, 0);
    // Friday: back at 21:50, still inside the window of Saturday's class
    s.reloj.fijar(en("2026-10-09T21:50:00"));
    assert.equal((await enviarRecordatorios(s.ctx)).enviados, 1);

    // «Hora del recordatorio»
    assert.equal((await ana.patch("/api/admin/ajustes", { "Hora del recordatorio": "25:00" })).status, 422);
    const aj = await ana.patch("/api/admin/ajustes", { "Hora del recordatorio": "7:30" });
    assert.equal(aj.json.find((x) => x.ajuste === "Hora del recordatorio").valor, "07:30");
    assert.equal(horaRecordatorio({ ajustesCrudo: { "Hora del recordatorio": 0.75 }, ajustes: {} }), "18:00", "a time value typed in the Sheet");
    assert.equal(horaRecordatorio({ ajustesCrudo: { "Hora del recordatorio": "nunca" }, ajustes: {} }), "18:00");
    const v = ventanaRecordatorio({ fecha: "2026-10-03", hora: "08:00" }, "21:00");
    assert.deepEqual([v.desde, v.hasta], [en("2026-10-02T21:00:00"), en("2026-10-03T00:00:00")], "never past midnight");
    const temprano = ventanaRecordatorio({ fecha: "2026-10-03", hora: "01:00" }, "18:00");
    assert.equal(temprano.hasta, en("2026-10-02T22:00:00"));
    const madrugada = ventanaRecordatorio({ fecha: "2026-10-03", hora: "00:30" }, "23:00");
    assert.equal(madrugada.hasta, en("2026-10-02T22:30:00"), "never less than 2 hours before");
    assert.ok(madrugada.hasta < madrugada.desde, "so that class gets none");
  } finally {
    await s.cerrar();
  }
});

test("WhatsApp connected: the template for those who opted in, e-mail for those with an address, or both", async () => {
  const wa = whatsappFalso();
  const s = await arrancar({ whatsapp: wa });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const ambas = await nuevaClienta(ana, { nombre: "Paula Ríos", whatsapp: "3155550501", correo: "paula@example.com", novedades: true });
    const soloWa = await nuevaClienta(ana, { nombre: "Sofía Pardo", whatsapp: "3155550502", novedades: true });
    const soloCorreo = await nuevaClienta(ana, { nombre: "Lucía Gómez", whatsapp: "3155550503", correo: "lucia@example.com" });
    for (const id of [ambas, soloWa, soloCorreo]) await reservar(ana, id, SAB_0800);
    await s.ctx.esperarSegundoPlano();
    wa.enviados.length = 0;
    s.reloj.fijar(en("2026-10-02T18:00:00"));
    assert.deepEqual(await enviarRecordatorios(s.ctx), { enviados: 3, correos: 2, whatsapps: 2 });
    const plantillas = wa.enviados.filter((x) => x.nombre === "recordatorio_clase");
    assert.deepEqual(plantillas.map((x) => x.whatsapp).sort(), ["573155550501", "573155550502"]);
    assert.deepEqual(plantillas.find((x) => x.whatsapp === "573155550502").variables, { nombre: "Sofía", cuando: "sábado 3 de octubre a las 8:00 a. m.", clase: "Stretch Aéreo" });
    const canales = Object.fromEntries(s.ctx.db.prepare("SELECT clienta, canales FROM recordatorios").all().map((f) => [f.clienta, f.canales]));
    assert.deepEqual(canales, { [ambas]: "correo,whatsapp", [soloWa]: "whatsapp", [soloCorreo]: "correo" });
  } finally {
    await s.cerrar();
  }
});

test("through Resend, the reminder carries List-Unsubscribe and List-Unsubscribe-Post", async () => {
  const llamadas = [];
  const fetchCorreo = async (_url, o) => { llamadas.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ id: "x" }) }; };
  const s = await arrancar({ env: { CORREO_DRIVER: "resend", RESEND_API_KEY: "re_test_clave_123456" }, fetchCorreo });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const paula = await nuevaClienta(ana, { nombre: "Paula Ríos", whatsapp: "3155550501", correo: "paula@example.com" });
    await reservar(ana, paula, SAB_0800);
    await s.ctx.esperarSegundoPlano();
    s.reloj.fijar(en("2026-10-02T18:00:00"));
    assert.equal((await enviarRecordatorios(s.ctx)).correos, 1);
    const m = llamadas.find((x) => /^Mañana tienes clase/.test(x.subject));
    assert.match(m.headers["List-Unsubscribe"], /^<https:\/\/casalotus\.studio\/api\/publico\/recordatorios\/baja\/[\w-]{40,}>$/);
    assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.ok(!llamadas.filter((x) => !/^Mañana tienes clase/.test(x.subject)).some((x) => x.headers), "only reminders carry them");
  } finally {
    await s.cerrar();
  }
});
