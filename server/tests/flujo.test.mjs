// The day of a booking end to end: the site books, Ana confirms with the payment, the profe marks
// attendance, the balance follows. Then cancellations, reschedules and the last-swing race.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, reservaWeb, ADMIN, PROFE } from "./ayuda.mjs";

const SAB_0915 = "2026-10-03 09:15"; // Yoga Aéreo multinivel · Ximena
const SAB_0800 = "2026-10-03 08:00"; // Stretch Aéreo · Geral
const MIE_1800 = "2026-10-07 18:00"; // Yoga Aéreo · Ximena
const MIE_1900 = "2026-10-07 19:00";

test("public booking → admin confirms with payment → profe marks attendance → balance", async () => {
  const s = await arrancar();
  try {
    const web = s.cliente();
    const r = await web.post("/api/publico/reservas", reservaWeb(SAB_0915, { clickIds: { gclid: "Cj0-test-gclid" } }));
    assert.equal(r.status, 201, r.texto);
    assert.equal(r.json.codigo, "R-0001");
    assert.equal(r.json.estado, "Pendiente de pago");
    assert.equal(r.json.sesion, true);
    assert.equal(r.json.pago.monto, 25000, "no plan given → trial price");
    assert.equal(r.json.pago.plan, "Clase de prueba");
    assert.equal(r.json.pago.llave, "319 328 8469");
    assert.match(r.json.pago.waEnlace, /^https:\/\/wa\.me\/573128720888\?text=/);
    assert.equal(r.json.clase.libres, 7);
    assert.ok(!("clienta" in r.json) && !("nueva" in r.json), "internal fields never leave");
    assert.ok(web.cookie, "the booking opens a session on this device");

    // her own account (someone new → full session)
    const yo = await web.get("/api/yo");
    assert.equal(yo.status, 200, yo.texto);
    assert.equal(yo.json.limitada, false);
    assert.equal(yo.json.proximas[0].id, "R-0001");
    assert.equal(yo.json.proximas[0].pago.monto, 25000);
    assert.equal(yo.json.clienta.perfil.nombre, "Laura Gómez");

    // Ana hears about it: e-mail (port of the Apps Script one), the bell
    await s.ctx.esperarSegundoPlano();
    assert.equal(s.ctx.correo.buzon.length, 1);
    assert.match(s.ctx.correo.buzon[0].asunto, /^Nueva reserva web · Laura Gómez/);
    assert.match(s.ctx.correo.buzon[0].html, /apartó un columpio/);
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const nov = await ana.get("/api/admin/novedades");
    assert.equal(nov.json.eventos[0].tipo, "reserva-web");
    const t = await ana.get("/api/admin/tablero");
    assert.equal(t.json.pendientes.length, 1);
    assert.equal(t.json.pendientes[0].nombre, "Laura Gómez");

    // confirming without a plan or payment is refused; with the payment it works
    const sinPago = await ana.post("/api/admin/reservas/R-0001/confirmar", {});
    assert.equal(sinPago.status, 422);
    const ok = await ana.post("/api/admin/reservas/R-0001/confirmar", { pago: { plan: "Clase de prueba", medio: "Nequi" } });
    assert.equal(ok.status, 200, ok.texto);
    assert.equal(ok.json.reserva.estado, "Confirmada");
    assert.equal(ok.json.compra.plan, "Clase de prueba");
    assert.equal(ok.json.compra.valor, 25000);
    assert.equal(ok.json.clase.gente[0].estado, "Confirmada");
    // the paid trial from an ad click became a Google Ads conversion (no CONVERSIONES_SHEET_ID → the tab)
    await s.ctx.esperarSegundoPlano();
    const conv = s.datos._tablas["Conversiones Ads"].filas;
    assert.equal(conv.length, 1);
    assert.equal(conv[0]["Conversion Name"], "Clase de prueba pagada");
    assert.equal(conv[0]["Google Click ID"], "Cj0-test-gclid");
    assert.equal(conv[0]["GBRAID"], "");
    assert.equal(conv[0]["Order ID"], ok.json.compra.id);
    assert.equal(conv[0]["Conversion Time"], "2026-10-01T10:00:00-05:00");
    assert.equal(conv[0]["Conversion Value"], "25000");
    assert.equal(conv[0]["Conversion Currency"], "COP");

    // after class: the profe (Ximena) marks attendance on her class
    s.reloj.fijar(Date.parse("2026-10-03T10:30:00-05:00"));
    const profe = s.cliente();
    await entrarComo(profe, PROFE);
    const mias = await profe.get("/api/profe/clases");
    assert.ok(mias.json.some((c) => c.id === SAB_0915), "her class is listed");
    assert.ok(!mias.json.some((c) => c.id === SAB_0800), "Geral's class is not");
    const marcada = await profe.post("/api/profe/reservas/R-0001/asistencia", { vino: true });
    assert.equal(marcada.status, 200, marcada.texto);
    assert.equal(marcada.json.gente[0].estado, "Asistió");
    assert.equal(marcada.json.gente[0].salud, "Ninguna", "the class's profe sees the health answer");
    const ajena = await profe.get("/api/profe/clases/" + encodeURIComponent(SAB_0800));
    assert.equal(ajena.status, 403);

    // balance: the trial is spent; a plan bought later gives 8
    let det = await ana.get("/api/admin/clientas/C-0001");
    assert.equal(det.json.saldo.clases, 0);
    assert.ok(det.json.segmentos.includes("prueba"));
    const pago = await ana.post("/api/admin/pagos", { clienta: "C-0001", plan: "8 clases al mes", medio: "Bre-B" });
    assert.equal(pago.status, 201, pago.texto);
    assert.equal(pago.json.saldo.clases, 8);
    await s.ctx.esperarSegundoPlano();
    const plan = s.datos._tablas["Conversiones Ads"].filas[1];
    assert.equal(plan["Conversion Name"], "Plan comprado", "her click is still inside the 90 days");
    assert.equal(plan["Order ID"], pago.json.compra.id);
    assert.equal(plan["Conversion Value"], "263000");
    const mia = await web.post("/api/yo/reservas", { clase: MIE_1800 });
    assert.equal(mia.status, 201, mia.texto);
    assert.equal(mia.json.estado, "Confirmada", "a valid plan confirms at once");
    det = await ana.get("/api/admin/clientas/C-0001");
    assert.equal(det.json.saldo.clases, 7);
    assert.equal(det.json.etapa, "activa");
    // audit trail
    const reg = await ana.get("/api/admin/registro?limite=50");
    const acciones = reg.json.map((x) => x.accion);
    for (const a of ["reserva.web", "reserva.confirmar", "reserva.asistencia", "pago.registrar", "reserva.crear"]) assert.ok(acciones.includes(a), a);
    assert.equal(reg.json.find((x) => x.accion === "reserva.asistencia").actor.tipo, "profe");
  } finally {
    await s.cerrar();
  }
});

async function clientaConPlan(s, ana, { nombre = "Paula Ríos", whatsapp = "3155550202", correo = "paula@example.com", plan = "8 clases al mes" } = {}) {
  const c = await ana.post("/api/admin/clientas", {
    nombre, whatsapp, correo, salud: "Ninguna", contactoEmergencia: { nombre: "Mamá", whatsapp: "3005559999" },
    consentimientos: { datos: { acepta: true }, descargo: { acepta: true }, imagen: { acepta: false } },
  });
  assert.equal(c.status, 201, c.texto);
  const p = await ana.post("/api/admin/pagos", { clienta: c.json.id, plan, medio: "Nequi" });
  assert.equal(p.status, 201, p.texto);
  // she signs in with the private link Ana sends
  const acc = await ana.post("/api/admin/clientas/" + c.json.id + "/acceso");
  const token = acc.json.enlace.split("/").pop();
  const ella = s.cliente();
  const e = await ella.get("/api/auth/enlace/" + token);
  assert.equal(e.status, 302);
  assert.equal(e.headers.get("location"), "/app/mi");
  return { id: c.json.id, ella };
}

test("cancel with notice gives the class back; late spends it but frees the swing", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const { id, ella } = await clientaConPlan(s, ana);
    const a = await ella.post("/api/yo/reservas", { clase: MIE_1800 });
    const b = await ella.post("/api/yo/reservas", { clase: SAB_0800 });
    assert.equal(a.json.estado, "Confirmada");
    assert.equal(b.json.cancelarSinCosto, true);
    assert.equal((await ella.get("/api/yo")).json.saldo.clases, 6);

    const aTiempo = await ella.post("/api/yo/reservas/" + a.json.id + "/cancelar");
    assert.equal(aTiempo.status, 200, aTiempo.texto);
    assert.equal(aTiempo.json.reserva.estado, "Cancelada");
    assert.equal(aTiempo.json.devolvioClase, true);
    assert.equal((await ella.get("/api/yo")).json.saldo.clases, 7);

    // Saturday 05:00: three hours before an 08:00 class (the rule is 6)
    s.reloj.fijar(Date.parse("2026-10-03T05:00:00-05:00"));
    const yo = await ella.get("/api/yo");
    assert.equal(yo.json.proximas[0].cancelarSinCosto, false);
    const tarde = await ella.post("/api/yo/reservas/" + b.json.id + "/cancelar");
    assert.equal(tarde.json.reserva.estado, "Cancelada tarde");
    assert.equal(tarde.json.devolvioClase, false);
    assert.match(tarde.json.mensaje, /se descuenta/);
    assert.equal(tarde.json.clase.libres, 8, "the swing is free again");
    assert.equal((await ella.get("/api/yo")).json.saldo.clases, 7, "the class stays spent");

    // nothing left to cancel, and someone else's booking is invisible
    assert.equal((await ella.post("/api/yo/reservas/" + b.json.id + "/cancelar")).json.motivo, "estado");
    const otra = await clientaConPlan(s, ana, { nombre: "Otra Persona", whatsapp: "3155550303", correo: "otra@example.com" });
    assert.equal((await otra.ella.post("/api/yo/reservas/" + a.json.id + "/cancelar")).status, 404);

    // admin may waive the late rule
    s.reloj.fijar(Date.parse("2026-10-07T15:00:00-05:00"));
    const c = await ana.post("/api/admin/reservas", { clienta: id, clase: MIE_1900 });
    assert.equal(c.status, 201, c.texto);
    const sinCosto = await ana.post("/api/admin/reservas/" + c.json.reserva.id + "/cancelar", { sinCosto: true });
    assert.equal(sinCosto.json.reserva.estado, "Cancelada");
    assert.equal(sinCosto.json.devolvioClase, true);

    // after the start nobody cancels
    s.reloj.fijar(Date.parse("2026-10-07T18:05:00-05:00"));
    const d = await ana.post("/api/admin/reservas", { clienta: id, clase: MIE_1800 });
    assert.equal(d.status, 201, "admin can still register a walk-in");
    assert.equal((await ana.post("/api/admin/reservas/" + d.json.reserva.id + "/cancelar", {})).json.motivo, "empezo");
  } finally {
    await s.cerrar();
  }
});

test("reschedule is atomic and a trial booking moves only once", async () => {
  const s = await arrancar();
  try {
    const web = s.cliente();
    const r = await web.post("/api/publico/reservas", reservaWeb(SAB_0800));
    assert.equal(r.status, 201);
    const uno = await web.post("/api/yo/reservas/" + r.json.codigo + "/reagendar", { clase: MIE_1800 });
    assert.equal(uno.status, 200, uno.texto);
    assert.equal(uno.json.anterior.estado, "Cancelada");
    assert.equal(uno.json.nueva.estado, "Pendiente de pago");
    assert.equal(uno.json.nueva.reagendadaDe, r.json.codigo);
    assert.equal(uno.json.nueva.clase.id, MIE_1800);
    const filas = s.datos._tablas.Reservas.filas;
    assert.equal(filas.filter((f) => ["Pendiente de pago", "Confirmada"].includes(f["Estado"])).length, 1, "never two live bookings");
    assert.equal(filas.find((f) => f["ID"] === uno.json.nueva.id)["Reagendada de"], r.json.codigo);

    const dos = await web.post("/api/yo/reservas/" + uno.json.nueva.id + "/reagendar", { clase: MIE_1900 });
    assert.equal(dos.status, 409);
    assert.equal(dos.json.motivo, "cambios");

    // a plan booking moves freely while there is notice, never late
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const { ella } = await clientaConPlan(s, ana);
    const b = await ella.post("/api/yo/reservas", { clase: SAB_0915 });
    const m1 = await ella.post("/api/yo/reservas/" + b.json.id + "/reagendar", { clase: MIE_1800 });
    assert.equal(m1.json.nueva.estado, "Confirmada");
    const m2 = await ella.post("/api/yo/reservas/" + m1.json.nueva.id + "/reagendar", { clase: MIE_1900 });
    assert.equal(m2.status, 200, m2.texto);
    assert.equal((await ella.get("/api/yo")).json.saldo.clases, 7, "moving never spends an extra class");
    s.reloj.fijar(Date.parse("2026-10-07T15:00:00-05:00"));
    const tarde = await ella.post("/api/yo/reservas/" + m2.json.nueva.id + "/reagendar", { clase: "2026-10-10 08:00" });
    assert.equal(tarde.json.motivo, "tarde");
    // a full target is refused before anything changes
    const llena = await ana.patch("/api/admin/clases/" + encodeURIComponent("2026-10-10 08:00"), { cupos: 1 });
    assert.equal(llena.status, 200);
    await ana.post("/api/admin/reservas", { clienta: "C-0001", clase: "2026-10-10 08:00" });
    s.reloj.fijar(Date.parse("2026-10-07T08:00:00-05:00"));
    const r3 = await ella.post("/api/yo/reservas/" + m2.json.nueva.id + "/reagendar", { clase: "2026-10-10 08:00" });
    assert.equal(r3.json.motivo, "llena");
    assert.equal(s.datos._tablas.Reservas.filas.find((f) => f["ID"] === m2.json.nueva.id)["Estado"], "Confirmada");
  } finally {
    await s.cerrar();
  }
});

test("last swing: two bookings at the same time, exactly one wins", async () => {
  const s = await arrancar({ latenciaMs: 4 });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const ajuste = await ana.patch("/api/admin/clases/" + encodeURIComponent(SAB_0800), { cupos: 2 });
    assert.equal(ajuste.status, 200);
    const primera = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { nombre: "Primera Uno", whatsapp: "3155550001" }));
    assert.equal(primera.status, 201);
    const [x, y] = await Promise.all([
      s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { nombre: "Carrera Dos", whatsapp: "3155550002" })),
      s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { nombre: "Carrera Tres", whatsapp: "3155550003" })),
    ]);
    const estados = [x.status, y.status].sort();
    assert.deepEqual(estados, [201, 409], JSON.stringify([x.json, y.json]));
    assert.equal([x, y].find((r) => r.status === 409).json.motivo, "llena");
    const ocupan = s.datos._tablas.Reservas.filas.filter((f) => f["Clase"] === SAB_0800 && f["Estado"] === "Pendiente de pago").length;
    assert.equal(ocupan, 2);
  } finally {
    await s.cerrar();
  }
});

test("the race test is real: without the write lock both would take the last swing", async () => {
  const s = await arrancar({ latenciaMs: 4, candado: { con: (fn) => fn() } });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    await ana.patch("/api/admin/clases/" + encodeURIComponent(SAB_0800), { cupos: 1 });
    const [x, y] = await Promise.all([
      s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { nombre: "Carrera Dos", whatsapp: "3155550002" })),
      s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { nombre: "Carrera Tres", whatsapp: "3155550003" })),
    ]);
    assert.deepEqual([x.status, y.status], [201, 201], "with no lock the double booking happens, so the lock is what prevents it");
  } finally {
    await s.cerrar();
  }
});
