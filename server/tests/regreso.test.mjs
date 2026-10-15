// Returning students without a login: «identificar» (name + WhatsApp), a public booking on her own plan,
// the student's confirmation and cancellation e-mails (with Google Calendar and .ics), the class duration
// and the «sin-clase» alert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, reservaWeb, whatsappFalso, ADMIN } from "./ayuda.mjs";
import { ics, plegar, enlaceGoogleCalendar } from "../src/notificaciones/calendario.js";
import { asegurarAjustes } from "../src/dominio/ajustes.js";

const SAB_0800 = "2026-10-03 08:00"; // Stretch Aéreo · Geral
const MIE_1800 = "2026-10-07 18:00"; // Yoga Aéreo · Ximena
const enc = encodeURIComponent;
const ACUERDOS = { datos: { acepta: true }, descargo: { acepta: true }, imagen: { acepta: true } };

/** A clienta created by Ana. plan: buys it; acceso: returns a full session for her. */
async function clienta(s, ana, { nombre, whatsapp, correo = "", completa = true, consentimientos = ACUERDOS, plan, acceso = false }) {
  const c = await ana.post("/api/admin/clientas", {
    nombre, whatsapp, correo, ...(completa ? { salud: "Ninguna", contactoEmergencia: { nombre: "Mamá", whatsapp: "3005559999" } } : {}),
    ...(consentimientos ? { consentimientos } : {}),
  });
  assert.equal(c.status, 201, c.texto);
  if (plan) assert.equal((await ana.post("/api/admin/pagos", { clienta: c.json.id, plan, medio: "Nequi" })).status, 201);
  let ella = null;
  if (acceso) {
    const acc = await ana.post("/api/admin/clientas/" + c.json.id + "/acceso");
    ella = s.cliente();
    assert.equal((await ella.get("/api/auth/enlace/" + acc.json.enlace.split("/").pop())).status, 302);
  }
  return { id: c.json.id, ella };
}

const correosPara = (s, para) => s.ctx.correo.buzon.filter((m) => m.para === para);

test("identificar: name + WhatsApp, nothing of her, only what the booking still needs", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    await clienta(s, ana, { nombre: "María Fernanda Ríos", whatsapp: "3155550401" });
    await clienta(s, ana, { nombre: "Sin Descargo", whatsapp: "3155550402", consentimientos: { datos: { acepta: true }, imagen: { acepta: false } } });
    await clienta(s, ana, { nombre: "Sin Contacto", whatsapp: "3155550403", completa: false });
    await clienta(s, ana, { nombre: "Nora Lead", whatsapp: "3155550404", completa: false, consentimientos: null });

    const web = s.cliente();
    const id = async (nombre, whatsapp) => {
      const r = await web.post("/api/publico/identificar", { nombre, whatsapp });
      assert.equal(r.status, 200, r.texto);
      assert.deepEqual(Object.keys(r.json).sort(), ["conocida", "pideAcuerdos", "pideFicha"], "never any of her data");
      return r.json;
    };
    const nadie = { conocida: false, pideFicha: true, pideAcuerdos: true };
    assert.deepEqual(await id("maria", "315 555 0401"), { conocida: true, pideFicha: false, pideAcuerdos: false }, "first name, no accents, any case");
    assert.deepEqual(await id("MARÍA José", "+57 315 555 0401"), { conocida: true, pideFicha: false, pideAcuerdos: false });
    assert.deepEqual(await id("Fernanda", "3155550401"), nadie, "the first name must match, not any name");
    assert.deepEqual(await id("María", "3155550499"), nadie, "unknown number");
    assert.deepEqual(await id("sin", "3155550402"), { conocida: true, pideFicha: false, pideAcuerdos: true }, "only the agreements are missing");
    assert.deepEqual(await id("Sin", "3155550403"), { conocida: true, pideFicha: true, pideAcuerdos: false }, "only the safety answers are missing");
    assert.deepEqual(await id("Nora", "3155550404"), { conocida: true, pideFicha: true, pideAcuerdos: true });
    assert.equal(web.cookie, "", "identifying opens no session");

    const mala = await web.post("/api/publico/identificar", { nombre: "A", whatsapp: "123" });
    assert.equal(mala.status, 422);
    assert.ok(mala.json.campos.nombre && mala.json.campos.whatsapp);
    const bot = await web.post("/api/publico/identificar", { nombre: "María", whatsapp: "3155550401", website: "spam" });
    assert.deepEqual(bot.json, nadie, "the honeypot gets a stranger's answer");
  } finally {
    await s.cerrar();
  }
});

test("identificar is rate-limited: 5/hour per phone, 10/hour per IP", async () => {
  const s = await arrancar();
  try {
    const web = s.cliente();
    const id = (whatsapp) => web.post("/api/publico/identificar", { nombre: "Alguien", whatsapp });
    for (let i = 0; i < 5; i++) assert.equal((await id("3155550500")).status, 200);
    const telefono = await id("3155550500");
    assert.equal(telefono.status, 429);
    assert.equal(telefono.json.error, "limite");
    for (let i = 1; i <= 4; i++) assert.equal((await id("315555050" + i)).status, 200, "another phone is still fine");
    assert.equal((await id("3155550509")).status, 429, "the 11th try from this IP");
    s.reloj.avanzar(61 * 60000);
    assert.equal((await id("3155550500")).status, 200, "an hour later it works again");
  } finally {
    await s.cerrar();
  }
});

test("a recognised student books on her own plan from the site: no agreements again, confirmed, limited session, e-mails", async () => {
  const wa = whatsappFalso();
  const s = await arrancar({ whatsapp: wa });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const { id } = await clienta(s, ana, { nombre: "Paula Ríos", whatsapp: "3155550202", correo: "paula@example.com", plan: "8 clases al mes" });

    const web = s.cliente();
    const r = await web.post("/api/publico/reservas", {
      clase: SAB_0800, perfil: { nombre: "paula", whatsapp: "315 555 0202", correo: "otra.direccion@example.com" }, consentimientos: {}, ref: "WEB-HERO", website: "",
    });
    assert.equal(r.status, 201, r.texto);
    assert.deepEqual(Object.keys(r.json).sort(), ["clase", "codigo", "conPlan", "correo", "estado", "pago", "saldo", "sesion"]);
    assert.equal(r.json.estado, "Confirmada");
    assert.equal(r.json.conPlan, true);
    assert.equal(r.json.pago, null);
    assert.deepEqual(r.json.saldo, { clases: 7, vence: "2026-10-30", venceTexto: "viernes 30 de octubre" });
    assert.equal(r.json.correo, true);
    assert.equal(r.json.clase.fin, "09:00");

    // the session stays limited: it sees this booking, not her plan or profile
    const yo = (await web.get("/api/yo")).json;
    assert.equal(yo.limitada, true);
    assert.deepEqual(yo.proximas.map((x) => x.id), [r.json.codigo]);
    assert.equal(yo.proximas[0].estado, "Confirmada");
    assert.ok(!("plan" in yo.proximas[0]));

    // her e-mail on file gets the confirmation; the typed one is neither used nor saved
    await s.ctx.esperarSegundoPlano();
    const suyos = correosPara(s, "paula@example.com");
    assert.equal(suyos.length, 1);
    assert.equal(suyos[0].asunto, "Tu clase en Casa Lotus · sábado 3 de octubre, 8:00 a. m.");
    assert.match(suyos[0].texto, /Quedó confirmada con tu plan\. Te quedan 7 clases\./);
    assert.equal(correosPara(s, "otra.direccion@example.com").length, 0);
    assert.equal(s.datos._tablas.Clientas.filas.find((f) => f["ID"] === id)["Correo"], "paula@example.com");
    // Ana: «Reservó con su plan» in the bell, the push-bearing novedad and the e-mail
    const nov = (await ana.get("/api/admin/novedades")).json.eventos.find((e) => e.tipo === "reserva-web");
    assert.equal(nov.titulo, "Reservó con su plan: Paula Ríos");
    const aviso = correosPara(s, "casalotusbogota@gmail.com")[0];
    assert.match(aviso.html, /reservó con su plan/);
    assert.match(aviso.texto, /Le quedan 7 clases/);
    assert.ok(!/comprobante/.test(aviso.texto));
    assert.equal(wa.enviados.find((m) => m.tipo === "plantilla").nombre, "reserva_confirmada");
    assert.equal((await ana.get("/api/admin/clientas/" + id)).json.saldo.clases, 7);
    assert.equal((await ana.get("/api/admin/tablero")).json.pendientes.length, 0, "nothing for Ana to confirm");

    // she cancels from the same phone with notice: the class goes back, and she hears it by e-mail
    const c = await web.post("/api/yo/reservas/" + r.json.codigo + "/cancelar");
    assert.equal(c.status, 200, c.texto);
    assert.equal(c.json.devolvioClase, true);
    assert.equal((await ana.get("/api/admin/clientas/" + id)).json.saldo.clases, 8);
    await s.ctx.esperarSegundoPlano();
    const cancel = correosPara(s, "paula@example.com").find((m) => m.asunto.startsWith("Cancelamos"));
    assert.equal(cancel.asunto, "Cancelamos tu clase · sábado 3 de octubre, 8:00 a. m.");
    assert.match(cancel.texto, /La clase volvió a tu plan\./);

    // recognised, but no class left on that date: she holds a swing like anyone
    assert.equal((await ana.post("/api/admin/clases", { fecha: "2026-10-31", hora: "08:00", clase: "Stretch Aéreo", profe: "Geral" })).status, 201);
    const sinPlan = await s.cliente().post("/api/publico/reservas", {
      clase: "2026-10-31 08:00", perfil: { nombre: "Paula", whatsapp: "3155550202" }, ref: "WEB", website: "",
    });
    assert.equal(sinPlan.status, 201, sinPlan.texto);
    assert.equal(sinPlan.json.estado, "Pendiente de pago", "her plan expires on 30 October");
    assert.equal(sinPlan.json.conPlan, false);
    assert.equal(sinPlan.json.saldo, null);
    assert.ok(sinPlan.json.pago.monto > 0);
  } finally {
    await s.cerrar();
  }
});

test("a stranger on a known number: must accept the agreements, never spends the plan, never sets her e-mail", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const { id } = await clienta(s, ana, { nombre: "Sofía Pardo", whatsapp: "3155550601", plan: "8 clases al mes" }); // no e-mail on file

    const sinAcuerdos = await s.cliente().post("/api/publico/reservas", {
      clase: SAB_0800, perfil: { nombre: "Intrusa", whatsapp: "3155550601" }, consentimientos: {}, website: "",
    });
    assert.equal(sinAcuerdos.status, 422);
    assert.ok(sinAcuerdos.json.campos["consentimientos.datos"] && sinAcuerdos.json.campos["consentimientos.descargo"] && sinAcuerdos.json.campos["consentimientos.imagen"]);

    const r = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { nombre: "Intrusa", whatsapp: "3155550601", correo: "intrusa@example.com" }));
    assert.equal(r.status, 201, r.texto);
    assert.equal(r.json.estado, "Pendiente de pago");
    assert.equal(r.json.conPlan, false);
    assert.equal(r.json.correo, true, "the address typed here gets the confirmation");
    assert.equal(s.datos._tablas.Clientas.filas.find((f) => f["ID"] === id)["Correo"], "", "a public form never sets her e-mail");
    await s.ctx.esperarSegundoPlano();
    const m = correosPara(s, "intrusa@example.com");
    assert.equal(m.length, 1);
    assert.match(m[0].texto, /Hola|cupo está apartado/);
    assert.ok(!m[0].texto.includes("Sofía") && !/Te quedan/.test(m[0].texto), "nothing of the owner");

    // so asking for a login code with her number never reaches the stranger
    s.ctx.correo.buzon.length = 0;
    await s.cliente().post("/api/auth/codigo", { whatsapp: "3155550601" });
    await s.ctx.esperarSegundoPlano();
    assert.equal(s.ctx.correo.buzon.length, 0);
  } finally {
    await s.cerrar();
  }
});

test("a recognised student with missing agreements accepts them on the site; someone new still needs them", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const { id } = await clienta(s, ana, { nombre: "Nora Lead", whatsapp: "3155550404", completa: false, consentimientos: null });
    const falta = await s.cliente().post("/api/publico/reservas", { clase: SAB_0800, perfil: { nombre: "Nora", whatsapp: "3155550404" }, website: "" });
    assert.equal(falta.status, 422);
    assert.ok(falta.json.campos["consentimientos.descargo"]);
    const ok = await s.cliente().post("/api/publico/reservas", {
      clase: SAB_0800, perfil: { nombre: "Nora", whatsapp: "3155550404", salud: "Ninguna", contactoEmergencia: { nombre: "Tía", whatsapp: "3005558888" } },
      consentimientos: ACUERDOS, website: "",
    });
    assert.equal(ok.status, 201, ok.texto);
    assert.equal(ok.json.estado, "Pendiente de pago", "no plan yet");
    assert.equal((await ana.get("/api/admin/clientas/" + id)).json.fichaCompleta, true, "her blanks were filled");
    assert.deepEqual((await s.cliente().post("/api/publico/identificar", { nombre: "Nora", whatsapp: "3155550404" })).json,
      { conocida: true, pideFicha: false, pideAcuerdos: false }, "next time: one question and done");

    const nueva = await s.cliente().post("/api/publico/reservas", { clase: SAB_0800, perfil: { nombre: "Nueva", whatsapp: "3155550405" }, website: "" });
    assert.equal(nueva.status, 422);
    assert.ok(nueva.json.campos["consentimientos.datos"]);
  } finally {
    await s.cerrar();
  }
});

test("confirmation e-mail: class, time range, profe, plan or payment, cancellation rule, Google Calendar link and .ics", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const { ella } = await clienta(s, ana, { nombre: "Valentina Ruiz", whatsapp: "3155550701", correo: "vale@example.com", plan: "8 clases al mes", acceso: true });

    // the app: confirmed on her plan
    const a = await ella.post("/api/yo/reservas", { clase: SAB_0800 });
    assert.equal(a.status, 201, a.texto);
    await s.ctx.esperarSegundoPlano();
    let m = correosPara(s, "vale@example.com").at(-1);
    assert.equal(m.asunto, "Tu clase en Casa Lotus · sábado 3 de octubre, 8:00 a. m.");
    assert.equal(m.de, "Casa Lotus <reservas@casalotus.studio>");
    for (const t of ["Stretch Aéreo", "Sábado 3 de octubre", "8:00 a. m. – 9:00 a. m.", "Con tu profe Geral", "Quedó confirmada con tu plan. Te quedan 7 clases.",
      "hasta 6 horas antes", "https://casalotus.studio/app/mi", "Agregar a Google Calendar"]) assert.ok(m.html.includes(t), t);
    assert.ok(m.texto.includes("https://calendar.google.com/calendar/render?action=TEMPLATE&text=Stretch+A%C3%A9reo+%C2%B7+Casa+Lotus&dates=20261003T130000Z/20261003T140000Z&details="));
    assert.ok(m.texto.includes("&location=Casa+Lotus,+Bogot%C3%A1"));
    assert.ok(m.html.includes("calendar.google.com/calendar/render?action=TEMPLATE&amp;text="), "escaped inside the HTML");
    assert.equal(m.adjuntos.length, 1);
    assert.equal(m.adjuntos[0].nombre, "casa-lotus-2026-10-03.ics");
    assert.match(m.adjuntos[0].tipo, /^text\/calendar/);
    const cal = m.adjuntos[0].contenido;
    for (const l of ["BEGIN:VCALENDAR", "METHOD:PUBLISH", "UID:" + a.json.id + "@casalotus.studio", "SEQUENCE:0", "DTSTART:20261003T130000Z", "DTEND:20261003T140000Z",
      "SUMMARY:Stretch Aéreo · Casa Lotus", "LOCATION:Casa Lotus\\, Bogotá", "STATUS:CONFIRMED", "TRIGGER:-PT2H", "END:VCALENDAR"]) assert.ok(cal.includes(l), l);
    assert.ok(cal.split("\r\n").every((l) => Buffer.byteLength(l) <= 75), "folded at 75 octets");
    assert.ok(!/[^\r]\n/.test(cal), "CRLF only");

    // she moves it: same calendar event (UID of the first booking, SEQUENCE 1), the e-mail says so
    const mov = await ella.post("/api/yo/reservas/" + a.json.id + "/reagendar", { clase: MIE_1800 });
    assert.equal(mov.status, 200, mov.texto);
    await s.ctx.esperarSegundoPlano();
    m = correosPara(s, "vale@example.com").at(-1);
    assert.equal(m.asunto, "Tu clase en Casa Lotus · miércoles 7 de octubre, 6:00 p. m.");
    assert.match(m.texto, /Movimos tu reserva del sábado 3 de octubre a las 8:00 a\. m\. a esta clase\./);
    assert.match(m.texto, /Con tu profe Ximena/);
    assert.ok(m.adjuntos[0].contenido.includes("UID:" + a.json.id + "@casalotus.studio") && m.adjuntos[0].contenido.includes("SEQUENCE:1"));

    // late cancellation: spent, and the e-mail says it plainly
    s.reloj.fijar(Date.parse("2026-10-07T15:00:00-05:00"));
    assert.equal((await ella.post("/api/yo/reservas/" + mov.json.nueva.id + "/cancelar")).json.devolvioClase, false);
    await s.ctx.esperarSegundoPlano();
    m = correosPara(s, "vale@example.com").at(-1);
    assert.equal(m.asunto, "Cancelamos tu clase · miércoles 7 de octubre, 6:00 p. m.");
    assert.match(m.texto, /Como faltaban menos de 6 horas, se liberó tu columpio pero la clase se descuenta de tu plan\./);
  } finally {
    await s.cerrar();
  }
});

test("a held swing e-mails how to pay; Ana's panel bookings and confirmations e-mail too; a cancelled class tells everyone", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const r = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { nombre: "Laura Gómez", whatsapp: "3155550801", correo: "laura.g@example.com" }));
    assert.equal(r.json.correo, true);
    await s.ctx.esperarSegundoPlano();
    let m = correosPara(s, "laura.g@example.com")[0];
    assert.match(m.texto, /Para confirmarla, paga \$25\.000 por Nequi, DaviPlata o Bre-B a la llave 319 328 8469 y envía el comprobante al WhatsApp 312 872 0888 antes del jueves 1 de octubre a las 10:00 p\. m\. Si no llega a tiempo, el cupo se libera solo\./);
    assert.match(m.html, /Enviar el comprobante por WhatsApp/);
    assert.match(m.html, /https:\/\/wa\.me\/573128720888\?text=/);
    assert.ok(m.adjuntos[0].contenido.includes("STATUS:TENTATIVE"));
    assert.ok(!m.texto.includes(".."), "no double periods");
    assert.equal(s.datos._tablas.Clientas.filas.find((f) => f["WhatsApp"] === "573155550801")["Correo"], "laura.g@example.com", "someone new keeps her e-mail");

    // Ana confirms the payment: «confirmada»
    await ana.post("/api/admin/reservas/" + r.json.codigo + "/confirmar", { pago: { plan: "Clase de prueba", medio: "Nequi" } });
    await s.ctx.esperarSegundoPlano();
    m = correosPara(s, "laura.g@example.com").at(-1);
    assert.match(m.texto, /Quedó confirmada con tu plan\. Era la última clase de tu plan\./);

    // Ana books someone with a plan from the panel
    const { id } = await clienta(s, ana, { nombre: "Camila Torres", whatsapp: "3155550802", correo: "camila@example.com", plan: "4 clases al mes" });
    assert.equal((await ana.post("/api/admin/reservas", { clienta: id, clase: SAB_0800 })).status, 201);
    await s.ctx.esperarSegundoPlano();
    assert.match(correosPara(s, "camila@example.com").at(-1).texto, /Te quedan 3 clases/);

    // nobody without an e-mail gets one
    const { id: sinCorreo } = await clienta(s, ana, { nombre: "Sin Correo", whatsapp: "3155550803", plan: "4 clases al mes" });
    const antes = s.ctx.correo.buzon.length;
    await ana.post("/api/admin/reservas", { clienta: sinCorreo, clase: SAB_0800 });
    await s.ctx.esperarSegundoPlano();
    assert.equal(s.ctx.correo.buzon.length, antes);

    // the studio cancels the class: each one hears it by e-mail
    const cancel = await ana.post("/api/admin/clases/" + enc(SAB_0800) + "/cancelar", { motivo: "corte de luz" });
    assert.equal(cancel.status, 200, cancel.texto);
    await s.ctx.esperarSegundoPlano();
    for (const para of ["laura.g@example.com", "camila@example.com"]) {
      const x = correosPara(s, para).at(-1);
      assert.equal(x.asunto, "Cancelamos tu clase · sábado 3 de octubre, 8:00 a. m.");
      assert.match(x.texto, /Tuvimos que cancelar esta clase \(corte de luz\)\. La clase volvió a tu plan\./);
    }
  } finally {
    await s.cerrar();
  }
});

test("no «te esperamos» for a class that already started (a walk-in Ana registers afterwards)", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const { id } = await clienta(s, ana, { nombre: "Tatiana Peña", whatsapp: "3155551201", correo: "tatiana@example.com", plan: "4 clases al mes" });
    s.reloj.fijar(Date.parse("2026-10-07T18:05:00-05:00"));
    assert.equal((await ana.post("/api/admin/reservas", { clienta: id, clase: MIE_1800 })).status, 201);
    await s.ctx.esperarSegundoPlano();
    assert.equal(correosPara(s, "tatiana@example.com").length, 0);
  } finally {
    await s.cerrar();
  }
});

test("an e-mail failure never fails the booking; Resend gets the .ics as a base64 attachment", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const { ella } = await clienta(s, ana, { nombre: "Daniela Mora", whatsapp: "3155550901", correo: "dani@example.com", plan: "8 clases al mes", acceso: true });
    s.ctx.correo.enviar = async () => { throw new Error("Resend no respondió a tiempo"); };
    const r = await ella.post("/api/yo/reservas", { clase: SAB_0800 });
    assert.equal(r.status, 201, r.texto);
    assert.equal(r.json.estado, "Confirmada");
    await s.ctx.esperarSegundoPlano();
  } finally {
    await s.cerrar();
  }

  const llamadas = [];
  const fetchCorreo = async (url, o) => { llamadas.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ id: "x" }) }; };
  const s2 = await arrancar({ env: { CORREO_DRIVER: "resend", RESEND_API_KEY: "re_test_clave_123456" }, fetchCorreo });
  try {
    const ana = s2.cliente();
    await entrarComo(ana, ADMIN);
    const { id } = await clienta(s2, ana, { nombre: "Andrea Castillo", whatsapp: "3155550902", correo: "andrea@example.com", plan: "8 clases al mes" });
    await ana.post("/api/admin/reservas", { clienta: id, clase: SAB_0800 });
    await s2.ctx.esperarSegundoPlano();
    const m = llamadas.find((x) => x.to[0] === "andrea@example.com");
    assert.equal(m.from, "Casa Lotus <reservas@casalotus.studio>");
    assert.equal(m.reply_to, "casalotusbogota@gmail.com");
    assert.equal(m.attachments.length, 1);
    assert.equal(m.attachments[0].filename, "casa-lotus-2026-10-03.ics");
    assert.equal(m.attachments[0].content_type, "text/calendar; charset=utf-8; method=PUBLISH");
    assert.match(Buffer.from(m.attachments[0].content, "base64").toString("utf8"), /^BEGIN:VCALENDAR\r\n/);
  } finally {
    await s2.cerrar();
  }
});

test("class duration: an Ajustes row with its default, «fin» on every class, the range in e-mails", async () => {
  const s = await arrancar();
  try {
    const anon = s.cliente();
    assert.equal((await anon.get("/api/publico/estudio")).json.duracion, 60);
    const disp = (await anon.get("/api/publico/disponibilidad?dias=7")).json.clases;
    assert.equal(disp.find((c) => c.id === SAB_0800).fin, "09:00");
    assert.equal(disp.find((c) => c.id === "2026-10-03 09:15").fin, "10:15");

    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    assert.equal((await ana.patch("/api/admin/ajustes", { "Duración de la clase (minutos)": 5 })).status, 422);
    const aj = await ana.patch("/api/admin/ajustes", { "Duración de la clase (minutos)": 75 });
    assert.equal(aj.status, 200, aj.texto);
    assert.equal(aj.json.find((x) => x.ajuste === "Duración de la clase (minutos)").valor, 75);
    assert.equal((await anon.get("/api/publico/estudio")).json.duracion, 75);
    assert.equal((await ana.get("/api/admin/clases/" + enc(SAB_0800))).json.fin, "09:15");
    await s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { whatsapp: "3155551001", correo: "nueva@example.com" }));
    await s.ctx.esperarSegundoPlano();
    const m = correosPara(s, "nueva@example.com")[0];
    assert.ok(m.html.includes("8:00 a. m. – 9:15 a. m."));
    assert.ok(m.adjuntos[0].contenido.includes("DTEND:20261003T141500Z"));

    // a Sheet without the row gets it appended with its default
    const filas = s.datos._tablas.Ajustes.filas;
    filas.splice(filas.findIndex((f) => f["Ajuste"] === "Duración de la clase (minutos)"), 1);
    await s.datos.actualizar("Ajustes", filas[0]._fila, {});
    assert.equal(await asegurarAjustes(s.ctx), 1);
    assert.equal(filas.find((f) => f["Ajuste"] === "Duración de la clase (minutos)")["Valor"], 60);
  } finally {
    await s.cerrar();
  }
});

test("alert «sin-clase»: one per weekly slot without a type in the next 14 days; the public class says nothing", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const slot = await ana.post("/api/admin/horario", { dia: "Viernes", hora: "18:00", clase: "Por confirmar", profe: "Laura", cupos: 6 });
    assert.equal(slot.status, 201, slot.texto);
    const extra = await ana.post("/api/admin/clases", { fecha: "2026-10-06", hora: "07:00", clase: "por confirmar", profe: "Geral" });
    assert.equal(extra.status, 201, extra.texto);
    assert.equal(extra.json.clase, "", "«Por confirmar» is never shown as a class name");

    const alertas = (await ana.get("/api/admin/tablero")).json.alertas.filter((a) => a.tipo === "sin-clase");
    assert.equal(alertas.length, 2);
    const viernes = alertas.find((a) => a.id === "sin-clase:Viernes 18:00");
    assert.deepEqual(viernes, {
      id: "sin-clase:Viernes 18:00", tipo: "sin-clase", prioridad: 2, titulo: "Viernes 6:00 p. m.: ponle el tipo de clase en Horario",
      detalle: "2 clases en los próximos 14 días dicen «Por confirmar» (vie 2 oct, vie 9 oct). En la web salen como «Clase aérea».",
      accion: { tipo: "abrir", ruta: "/app/admin/horario" },
    });
    const ex = alertas.find((a) => a.id === "sin-clase:2026-10-06 07:00");
    assert.equal(ex.titulo, "Clase extra sin tipo: mar 6 oct · 7:00 a. m.");
    assert.deepEqual(ex.accion, { tipo: "abrir", ruta: "/app/admin/agenda/2026-10-06%2007%3A00" });

    const pub = (await s.cliente().get("/api/publico/disponibilidad?dias=10")).json.clases.find((c) => c.id === "2026-10-02 18:00");
    assert.equal(pub.clase, "");
    await s.cliente().post("/api/publico/reservas", reservaWeb("2026-10-02 18:00", { whatsapp: "3155551101", correo: "viernes@example.com" }));
    await s.ctx.esperarSegundoPlano();
    const m = correosPara(s, "viernes@example.com")[0];
    assert.ok(m.html.includes("Clase aérea") && !m.html.includes("Por confirmar"));

    // giving the slot its type (and its classes) clears the alert
    await ana.patch("/api/admin/horario/" + enc("Viernes 18:00"), { clase: "Pilates Aéreo", aplicarAFuturas: true });
    const despues = (await ana.get("/api/admin/tablero")).json.alertas.filter((a) => a.tipo === "sin-clase").map((a) => a.id);
    assert.deepEqual(despues, ["sin-clase:2026-10-06 07:00"]);
  } finally {
    await s.cerrar();
  }
});

test("calendar helpers: escaping, UTF-8 folding, the Google link", () => {
  const largo = "Á".repeat(60);
  const plegada = plegar("DESCRIPTION:" + largo);
  assert.ok(plegada.split("\r\n").every((l) => Buffer.byteLength(l) <= 75));
  assert.equal(plegada.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join(""), "DESCRIPTION:" + largo, "unfolds to the same text");
  const t = ics({ uid: "R-1@casalotus.studio", titulo: "Yoga; aéreo, nivel 1", descripcion: "Línea 1\nLínea 2", inicio: 0, fin: 3600000, confirmada: true, ahora: 0 });
  assert.ok(t.includes("SUMMARY:Yoga\\; aéreo\\, nivel 1") && t.includes("DESCRIPTION:Línea 1\\nLínea 2"));
  assert.equal(enlaceGoogleCalendar({ titulo: "Clase aérea · Casa Lotus", descripcion: "a, b", inicio: 0, fin: 3600000 }),
    "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Clase+a%C3%A9rea+%C2%B7+Casa+Lotus&dates=19700101T000000Z/19700101T010000Z&details=a,+b&location=Casa+Lotus,+Bogot%C3%A1");
});
