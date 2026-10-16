// Cupos fijos: a regular holds her weekly slot and the system books it «Días de reserva de cupos fijos»
// ahead (CONTRATO §10). The clock is Thursday 1 October 2026, 10:00: the 14-day window ends on the 15th.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, reservaWeb, ADMIN } from "./ayuda.mjs";
import { aplicarFijos } from "../src/dominio/fijos.js";
import { expirarApartados } from "../src/dominio/reservas.js";
import { tareaDiaria } from "../src/tareas/index.js";
import { ejecutar } from "../src/herramientas/index.js";

const SAB_0800 = "2026-10-03 08:00";
const SAB_1008 = "2026-10-10 08:00";
const enc = encodeURIComponent;
const filaReserva = (s, id) => s.datos._tablas.Reservas.filas.find((f) => f["ID"] === id);
const deFijo = (s, id) => s.datos._tablas.Reservas.filas.filter((f) => f["Origen"] === "Cupo fijo · " + id);

async function nuevaClienta(ana, { nombre = "Valentina Ruiz", whatsapp = "3155550401", correo = "valentina@example.com", plan } = {}) {
  const c = await ana.post("/api/admin/clientas", {
    nombre, whatsapp, correo, salud: "Ninguna", contactoEmergencia: { nombre: "Mamá", whatsapp: "3005559999" },
    consentimientos: { datos: { acepta: true }, descargo: { acepta: true }, imagen: { acepta: true } },
  });
  assert.equal(c.status, 201, c.texto);
  if (plan) assert.equal((await ana.post("/api/admin/pagos", { clienta: c.json.id, plan, medio: "Nequi" })).status, 201);
  return c.json.id;
}

async function suSesion(s, ana, id) {
  const acc = await ana.post("/api/admin/clientas/" + id + "/acceso");
  const ella = s.cliente();
  await ella.get("/api/auth/enlace/" + acc.json.enlace.split("/").pop());
  return ella;
}

async function preparar(opciones) {
  const s = await arrancar(opciones);
  const ana = s.cliente();
  await entrarComo(ana, ADMIN);
  return { s, ana };
}

test("a fijo with a plan books the next 14 days confirmed; one e-mail; every view knows it", async () => {
  const { s, ana } = await preparar();
  try {
    const vale = await nuevaClienta(ana, { plan: "8 clases al mes" });
    await s.ctx.esperarSegundoPlano();
    s.ctx.correo.buzon.length = 0;
    const r = await ana.post("/api/admin/fijos", { clienta: vale, dia: "Sábado", hora: "08:00", notas: "Columpio de la ventana" });
    assert.equal(r.status, 201, r.texto);
    const { fijo, reservasCreadas, conflictos } = r.json;
    assert.deepEqual(
      { ...fijo, proximas: undefined },
      { id: "F-0001", clienta: { id: vale, nombre: "Valentina Ruiz" }, dia: "Sábado", hora: "08:00", slot: "Sábado 08:00", slotTexto: "sábados 8:00 a. m.",
        desde: "2026-10-01", hasta: "", estado: "Activo", notas: "Columpio de la ventana", proximas: undefined },
    );
    assert.deepEqual(reservasCreadas.map((x) => [x.clase.id, x.estado, x.fijo]), [[SAB_0800, "Confirmada", "F-0001"], [SAB_1008, "Confirmada", "F-0001"]],
      "the 17th is past the 14-day window");
    assert.deepEqual(conflictos, []);
    assert.deepEqual(fijo.proximas.map((p) => [p.clase.id, p.estado]), [[SAB_0800, "Confirmada"], [SAB_1008, "Confirmada"]]);
    const fila = filaReserva(s, reservasCreadas[0].id);
    assert.equal(fila["Origen"], "Cupo fijo · F-0001");
    assert.equal(fila["Compra"], "P-0001");
    assert.equal(s.datos._tablas["Cupos fijos"].filas[0]["Estado"], "Activo");

    // one confirmation e-mail, for the first class only, saying it is her fijo
    await s.ctx.esperarSegundoPlano();
    const correos = s.ctx.correo.buzon.filter((m) => m.para === "valentina@example.com");
    assert.equal(correos.length, 1, "no weekly spam");
    assert.match(correos[0].asunto, /sábado 3 de octubre/);
    assert.match(correos[0].texto, /Es tu cupo fijo de los sábados 8:00 a\. m\./);

    // the views
    const det = (await ana.get("/api/admin/clientas/" + vale)).json;
    assert.equal(det.saldo.clases, 6);
    assert.deepEqual(det.fijos.map((f) => f.id), ["F-0001"]);
    assert.ok(det.segmentos.includes("con-cupo-fijo"));
    assert.equal(det.reservas.find((x) => x.clase.id === SAB_0800).fijo, "F-0001");
    const seg = (await ana.get("/api/admin/segmentos")).json.find((x) => x.id === "con-cupo-fijo");
    assert.deepEqual([seg.nombre, seg.total], ["Con horario fijo", 1]);
    const slot = (await ana.get("/api/admin/horario")).json.find((x) => x.id === "Sábado 08:00");
    assert.deepEqual([slot.fijos, slot.cuposFijos], [[{ id: "F-0001", clienta: { id: vale, nombre: "Valentina Ruiz" }, estado: "Activo" }], 1]);
    assert.equal((await ana.get("/api/admin/tablero")).json.kpis.fijosActivos, 1);
    const clase = (await ana.get("/api/admin/clases/" + enc(SAB_0800))).json;
    assert.equal(clase.gente[0].fijo, "F-0001");
    const lista = (await ana.get("/api/admin/fijos?slot=" + enc("Sábado 08:00"))).json;
    assert.deepEqual(lista.map((f) => f.id), ["F-0001"]);
    assert.deepEqual((await ana.get("/api/admin/fijos?slot=" + enc("Sábado 09:15"))).json, []);
    assert.equal((await ana.get("/api/admin/fijos?clienta=" + vale)).json.length, 1);
    assert.equal((await ana.get("/api/admin/fijos?slot=Feriado")).status, 422);

    // she sees it, read only, and the bookings carry it
    const ella = await suSesion(s, ana, vale);
    const yo = (await ella.get("/api/yo")).json;
    assert.deepEqual(yo.fijos, [{ id: "F-0001", slotTexto: "sábados 8:00 a. m.", estado: "Activo", desde: "2026-10-01", hasta: "" }]);
    assert.equal(yo.proximas[0].fijo, "F-0001");

    // the public grid counts them like any booking (no names)
    const pub = (await s.cliente().get("/api/publico/disponibilidad?dias=14")).json.clases.find((c) => c.id === SAB_0800);
    assert.deepEqual([pub.ocupados, pub.libres], [1, 7]);
    assert.ok(!JSON.stringify(pub).includes("Valentina"));

    // an audit trail
    const reg = (await ana.get("/api/admin/registro?limite=20")).json;
    assert.ok(reg.some((x) => x.accion === "fijo.crear" && x.objeto === "F-0001"));
  } finally {
    await s.cerrar();
  }
});

test("without a plan: «Pendiente de pago» that never expires, and the alert to renew", async () => {
  const { s, ana } = await preparar();
  try {
    const cami = await nuevaClienta(ana, { nombre: "Camila Torres", whatsapp: "3155550402", correo: "" });
    const r = await ana.post("/api/admin/fijos", { clienta: cami, dia: "Miércoles", hora: "18:00" });
    assert.equal(r.status, 201, r.texto);
    assert.deepEqual(r.json.reservasCreadas.map((x) => [x.clase.id, x.estado]), [["2026-10-07 18:00", "Pendiente de pago"], ["2026-10-14 18:00", "Pendiente de pago"]]);
    assert.equal(r.json.reservasCreadas[0].pago.venceApartado, null, "no deadline");
    for (const x of r.json.reservasCreadas) {
      const f = filaReserva(s, x.id);
      assert.equal(f["Vence apartado"], undefined);
      assert.equal(f["Notas"], "Cupo fijo · sin plan");
    }

    let t = (await ana.get("/api/admin/tablero")).json;
    let alerta = t.alertas.find((a) => a.id === "fijo-sin-plan:F-0001");
    assert.ok(alerta, JSON.stringify(t.alertas.map((a) => a.id)));
    assert.equal(alerta.prioridad, 2, "the class is more than 48 h away");
    assert.deepEqual(alerta.clienta, { id: cami, nombre: "Camila Torres" });
    assert.equal(alerta.clase.id, "2026-10-07 18:00");
    assert.equal(alerta.accion.tipo, "whatsapp");
    assert.equal(alerta.accion.texto, "Hola Camila, tu clase fija del miércoles 6:00 p. m. sigue apartada para ti. Para confirmarla, ¿renovamos tu plan?");
    assert.ok(!t.alertas.some((a) => a.tipo === "pago-por-vencer"), "nothing is about to expire");
    assert.equal(t.pendientes.filter((p) => p.clienta === cami).length, 2);
    assert.equal(t.pendientes.find((p) => p.clienta === cami).venceApartado, null);

    // the hold job never touches them, while a normal web hold still expires
    const web = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { whatsapp: "3155550499" }));
    assert.equal(web.status, 201, web.texto);
    s.reloj.fijar(Date.parse("2026-10-06T20:00:00-05:00"));
    assert.equal(await expirarApartados(s.ctx), 1);
    assert.equal(filaReserva(s, web.json.codigo)["Estado"], "Vencida");
    assert.deepEqual(deFijo(s, "F-0001").map((f) => f["Estado"]), ["Pendiente de pago", "Pendiente de pago"]);

    // 22 h before the class: urgent
    t = (await ana.get("/api/admin/tablero")).json;
    alerta = t.alertas.find((a) => a.id === "fijo-sin-plan:F-0001");
    assert.equal(alerta.prioridad, 1);

    // she pays: Ana confirms one with the payment, and the plan confirms her other fijo hold too
    const conf = await ana.post("/api/admin/reservas/" + r.json.reservasCreadas[0].id + "/confirmar", { pago: { plan: "4 clases al mes", medio: "Nequi" } });
    assert.equal(conf.status, 200, conf.texto);
    assert.equal(conf.json.reserva.estado, "Confirmada");
    assert.deepEqual(conf.json.reservasConfirmadas.map((x) => [x.clase.id, x.estado, x.fijo]), [["2026-10-14 18:00", "Confirmada", "F-0001"]]);
    assert.deepEqual(deFijo(s, "F-0001").map((f) => [f["Estado"], f["Notas"]]), [["Confirmada", ""], ["Confirmada", ""]]);
    assert.ok(!(await ana.get("/api/admin/tablero")).json.alertas.some((a) => a.tipo === "fijo-sin-plan"));
    assert.equal((await ana.get("/api/admin/clientas/" + cami)).json.saldo.clases, 2);

    // the same when Ana records the payment on its own (POST /api/admin/pagos)
    const lu = await nuevaClienta(ana, { nombre: "Lucía Gómez", whatsapp: "3155550403", correo: "" });
    await ana.post("/api/admin/fijos", { clienta: lu, dia: "Miércoles", hora: "19:00" });
    const pago = await ana.post("/api/admin/pagos", { clienta: lu, plan: "4 clases al mes", medio: "Bre-B" });
    assert.equal(pago.status, 201, pago.texto);
    assert.deepEqual(pago.json.reservasConfirmadas.map((x) => [x.clase.id, x.estado]), [["2026-10-07 19:00", "Confirmada"], ["2026-10-14 19:00", "Confirmada"]]);
    assert.equal(pago.json.saldo.clases, 2);
  } finally {
    await s.cerrar();
  }
});

test("re-runs are idempotent; the daily job books the new week; a cancelled date is never booked again", async () => {
  const { s, ana } = await preparar();
  try {
    const vale = await nuevaClienta(ana, { plan: "8 clases al mes" });
    await ana.post("/api/admin/fijos", { clienta: vale, dia: "Sábado", hora: "08:00" });
    assert.equal(deFijo(s, "F-0001").length, 2);
    assert.deepEqual(await aplicarFijos(s.ctx), { creadas: 0, conflictos: 0 });
    assert.equal(deFijo(s, "F-0001").length, 2, "nothing twice");

    // she cannot come on the 10th: she cancels that date with the normal policy
    const ella = await suSesion(s, ana, vale);
    const diez = (await ella.get("/api/yo")).json.proximas.find((x) => x.clase.id === SAB_1008);
    const c = await ella.post("/api/yo/reservas/" + diez.id + "/cancelar");
    assert.equal(c.status, 200, c.texto);
    assert.equal(c.json.reserva.estado, "Cancelada");
    assert.equal(c.json.devolvioClase, true);
    assert.deepEqual(await aplicarFijos(s.ctx), { creadas: 0, conflictos: 0 });
    assert.equal(deFijo(s, "F-0001").filter((f) => f["Clase"] === SAB_1008).length, 1, "what she cancelled stays cancelled");

    // a week later the daily job books the 17th (the calendar keeps its four weeks)
    s.reloj.fijar(Date.parse("2026-10-08T03:05:00-05:00"));
    await tareaDiaria(s.ctx);
    const clases = deFijo(s, "F-0001").map((f) => f["Clase"]).sort();
    assert.deepEqual(clases, [SAB_0800, SAB_1008, "2026-10-17 08:00"]);
    await tareaDiaria(s.ctx);
    assert.equal(deFijo(s, "F-0001").length, 3, "the job again changes nothing");
    assert.equal(filaReserva(s, deFijo(s, "F-0001").find((f) => f["Clase"] === SAB_1008)["ID"])["Estado"], "Cancelada");
  } finally {
    await s.cerrar();
  }
});

test("a full class: no booking, a conflict and an alert; more swings let her in", async () => {
  const { s, ana } = await preparar();
  try {
    await ana.patch("/api/admin/clases/" + enc(SAB_1008), { cupos: 1 });
    assert.equal((await s.cliente().post("/api/publico/reservas", reservaWeb(SAB_1008, { nombre: "Otra Persona", whatsapp: "3155550410" }))).status, 201);
    const vale = await nuevaClienta(ana, { plan: "8 clases al mes" });
    const r = await ana.post("/api/admin/fijos", { clienta: vale, dia: "Sábado", hora: "08:00" });
    assert.equal(r.status, 201, r.texto);
    assert.deepEqual(r.json.reservasCreadas.map((x) => x.clase.id), [SAB_0800]);
    assert.deepEqual(r.json.conflictos.map((x) => [x.clase.id, x.motivo, x.clase.libres]), [[SAB_1008, "llena", 0]]);
    const alerta = (await ana.get("/api/admin/tablero")).json.alertas.find((a) => a.id === "fijo-sin-columpio:F-0001:" + SAB_1008);
    assert.ok(alerta);
    assert.equal(alerta.prioridad, 1);
    assert.deepEqual(alerta.accion, { tipo: "abrir", ruta: "/app/admin/agenda/" + enc(SAB_1008) });
    assert.deepEqual(alerta.clienta, { id: vale, nombre: "Valentina Ruiz" });

    // Ana opens one more swing: the fijo takes it at once and the alert goes away
    const mas = await ana.patch("/api/admin/clases/" + enc(SAB_1008), { cupos: 2 });
    assert.equal(mas.status, 200, mas.texto);
    assert.equal(mas.json.gente.find((g) => g.clienta === vale)?.fijo, "F-0001");
    assert.ok(!(await ana.get("/api/admin/tablero")).json.alertas.some((a) => a.tipo === "fijo-sin-columpio"));
  } finally {
    await s.cerrar();
  }
});

test("pause with cancelarFuturas gives the classes back (even late); resume books what comes; end is final", async () => {
  const { s, ana } = await preparar();
  try {
    const vale = await nuevaClienta(ana, { plan: "8 clases al mes" });
    await ana.post("/api/admin/fijos", { clienta: vale, dia: "Sábado", hora: "08:00" });
    assert.equal((await ana.get("/api/admin/clientas/" + vale)).json.saldo.clases, 6);

    // Saturday 05:00: three hours before the class, inside the 6 h rule, and still sin costo
    s.reloj.fijar(Date.parse("2026-10-03T05:00:00-05:00"));
    const p = await ana.patch("/api/admin/fijos/F-0001", { estado: "Pausado", cancelarFuturas: true });
    assert.equal(p.status, 200, p.texto);
    assert.equal(p.json.fijo.estado, "Pausado");
    assert.deepEqual(p.json.reservasCanceladas.map((x) => [x.clase.id, x.estado]), [[SAB_0800, "Cancelada"], [SAB_1008, "Cancelada"]]);
    assert.deepEqual(p.json.reservasCreadas, []);
    assert.deepEqual(p.json.fijo.proximas, []);
    assert.equal(filaReserva(s, p.json.reservasCanceladas[0].id)["Notas"], "Cupo fijo pausado");
    assert.equal((await ana.get("/api/admin/clientas/" + vale)).json.saldo.clases, 8, "both classes went back to her plan");
    assert.deepEqual(await aplicarFijos(s.ctx), { creadas: 0, conflictos: 0 }, "a paused fijo books nothing");
    const slot = (await ana.get("/api/admin/horario")).json.find((x) => x.id === "Sábado 08:00");
    assert.deepEqual([slot.fijos.map((f) => f.estado), slot.cuposFijos], [["Pausado"], 0]);
    assert.ok(!(await ana.get("/api/admin/clientas/" + vale)).json.segmentos.includes("con-cupo-fijo"));

    // resuming books again the dates the pause freed (only what she cancelled herself stays cancelled)
    s.reloj.fijar(Date.parse("2026-10-08T10:00:00-05:00"));
    const back = await ana.patch("/api/admin/fijos/F-0001", { estado: "Activo" });
    assert.equal(back.status, 200, back.texto);
    assert.deepEqual(back.json.reservasCreadas.map((x) => [x.clase.id, x.estado]), [[SAB_1008, "Confirmada"], ["2026-10-17 08:00", "Confirmada"]]);
    // a pause from a date: what comes after `hasta` is freed, the rest stays
    s.reloj.fijar(Date.parse("2026-10-15T10:00:00-05:00"));
    await aplicarFijos(s.ctx);
    assert.deepEqual(deFijo(s, "F-0001").filter((f) => f["Estado"] === "Confirmada").map((f) => f["Clase"]), [SAB_1008, "2026-10-17 08:00", "2026-10-24 08:00"]);
    const corte = await ana.patch("/api/admin/fijos/F-0001", { estado: "Pausado", hasta: "2026-10-17", cancelarFuturas: true });
    assert.deepEqual(corte.json.reservasCanceladas.map((x) => x.clase.id), ["2026-10-24 08:00"]);
    assert.equal(corte.json.fijo.hasta, "2026-10-17");
    assert.deepEqual(corte.json.fijo.proximas.map((x) => x.clase.id), ["2026-10-17 08:00"]);

    // resuming after that date clears the end date that already passed
    s.reloj.fijar(Date.parse("2026-10-19T10:00:00-05:00"));
    await tareaDiaria(s.ctx); // the calendar reaches November
    const otra = await ana.patch("/api/admin/fijos/F-0001", { estado: "Activo" });
    assert.equal(otra.json.fijo.hasta, "");
    assert.deepEqual(otra.json.reservasCreadas.map((x) => x.clase.id), ["2026-10-24 08:00", "2026-10-31 08:00"], "the 24th the pause freed comes back");

    // the end: future bookings cancelled, no way back
    const fin = await ana.del("/api/admin/fijos/F-0001");
    assert.equal(fin.status, 200, fin.texto);
    assert.equal(fin.json.fijo.estado, "Terminado");
    assert.deepEqual(Object.keys(fin.json).sort(), ["fijo", "reservasCanceladas"]);
    assert.ok(fin.json.reservasCanceladas.every((x) => x.estado === "Cancelada"));
    // the 31st is past her plan's expiry (30 October): it was held without a plan, and now it is freed
    assert.deepEqual(fin.json.reservasCanceladas.map((x) => x.clase.id), ["2026-10-24 08:00", "2026-10-31 08:00"]);
    assert.equal(filaReserva(s, fin.json.reservasCanceladas[1].id)["Notas"], "Cupo fijo · sin plan · Cupo fijo terminado");
    const revivir = await ana.patch("/api/admin/fijos/F-0001", { estado: "Activo" });
    assert.deepEqual([revivir.status, revivir.json.motivo], [409, "estado"]);
    assert.equal((await ana.patch("/api/admin/fijos/F-0009", { estado: "Activo" })).status, 404);
    // a new fijo on the same slot is possible once the old one ended
    assert.equal((await ana.post("/api/admin/fijos", { clienta: vale, dia: "Sábado", hora: "08:00" })).status, 201);
  } finally {
    await s.cerrar();
  }
});

test("holidays, Desde/Hasta and the rules of creation", async () => {
  const { s, ana } = await preparar();
  try {
    const vale = await nuevaClienta(ana, { plan: "8 clases al mes" });
    // a Monday slot: 12 October is a holiday (Día de la Raza), so that week has no class to book
    assert.equal((await ana.post("/api/admin/horario", { dia: "Lunes", hora: "18:00", clase: "Pilates Aéreo", profe: "Laura", cupos: 6 })).status, 201);
    const lunes = await ana.post("/api/admin/fijos", { clienta: vale, dia: "Lunes", hora: "18:00" });
    assert.equal(lunes.status, 201, lunes.texto);
    assert.deepEqual(lunes.json.reservasCreadas.map((x) => x.clase.id), ["2026-10-05 18:00"]);
    assert.ok(!s.datos._tablas.Clases.filas.some((f) => f["ID"] === "2026-10-12 18:00"));

    // Desde and Hasta frame the bookings: only the 10th fits
    const ventana = await ana.post("/api/admin/fijos", { clienta: vale, dia: "Sábado", hora: "09:15", desde: "2026-10-05", hasta: "2026-10-12" });
    assert.equal(ventana.status, 201, ventana.texto);
    assert.deepEqual(ventana.json.reservasCreadas.map((x) => x.clase.id), ["2026-10-10 09:15"]);
    assert.deepEqual([ventana.json.fijo.desde, ventana.json.fijo.hasta], ["2026-10-05", "2026-10-12"]);

    // refusals
    const r = (b) => ana.post("/api/admin/fijos", { clienta: vale, ...b });
    const repetido = await r({ dia: "Lunes", hora: "18:00" });
    assert.deepEqual([repetido.status, repetido.json.motivo], [409, "ya-reservada"]);
    const inactiva = await r({ dia: "Martes", hora: "07:00" });
    assert.equal(inactiva.status, 422);
    assert.ok(inactiva.json.campos.hora);
    const alReves = await r({ dia: "Miércoles", hora: "18:00", desde: "2026-10-20", hasta: "2026-10-10" });
    assert.equal(alReves.status, 422);
    assert.ok(alReves.json.campos.hasta);
    assert.equal((await ana.post("/api/admin/fijos", { clienta: "C-0099", dia: "Miércoles", hora: "18:00" })).status, 404);
    assert.equal((await ana.post("/api/admin/fijos", { clienta: vale, dia: "Feriado", hora: "18:00" })).status, 422);

    // the window is a setting
    const aj = (await ana.get("/api/admin/ajustes")).json.find((x) => x.ajuste === "Días de reserva de cupos fijos");
    assert.equal(aj.valor, 14);
    assert.equal((await ana.patch("/api/admin/ajustes", { "Días de reserva de cupos fijos": 0 })).status, 422);
    await ana.patch("/api/admin/ajustes", { "Días de reserva de cupos fijos": 3 });
    const corto = await ana.post("/api/admin/fijos", { clienta: vale, dia: "Miércoles", hora: "19:00" });
    assert.deepEqual(corto.json.reservasCreadas, [], "the 7th is 6 days away");
  } finally {
    await s.cerrar();
  }
});

test("a Sheet without «Cupos fijos»: everything reads, health says so, the first fijo creates the tab", async () => {
  const { s, ana } = await preparar({ sinPestanas: ["Cupos fijos"] });
  try {
    let sal = (await ana.get("/api/admin/salud")).json;
    assert.equal(sal.hoja.ok, true, "an optional tab");
    assert.ok(sal.hoja.faltan.includes("Cupos fijos"));
    assert.deepEqual([sal.fijos.pestana, sal.fijos.activos], [false, 0]);
    assert.match(sal.fijos.aviso, /se crea sola/);
    assert.deepEqual((await ana.get("/api/admin/fijos")).json, []);
    assert.deepEqual((await ana.get("/api/admin/horario")).json[0].fijos, []);
    assert.equal((await ana.get("/api/admin/tablero")).status, 200);
    assert.deepEqual(await aplicarFijos(s.ctx), { creadas: 0, conflictos: 0 });

    const vale = await nuevaClienta(ana, { plan: "8 clases al mes" });
    const r = await ana.post("/api/admin/fijos", { clienta: vale, dia: "Sábado", hora: "08:00" });
    assert.equal(r.status, 201, r.texto);
    assert.equal(r.json.reservasCreadas.length, 2);
    const t = s.datos._tablas["Cupos fijos"];
    assert.deepEqual(t.columnas, ["ID", "Clienta", "Día", "Hora", "Desde", "Hasta", "Estado", "Notas"]);
    assert.equal(t.filas[0]["ID"], "F-0001");
    sal = (await ana.get("/api/admin/salud")).json;
    assert.deepEqual([sal.fijos.pestana, sal.fijos.activos, sal.hoja.faltan.includes("Cupos fijos")], [true, 1, false]);
    assert.ok((await ana.get("/api/admin/registro?limite=30")).json.some((x) => x.accion === "hoja.pestana" && x.objeto === "Cupos fijos"));
  } finally {
    await s.cerrar();
  }
});

test("AI tools: listar_fijos, crear_fijo, pausar_fijo", async () => {
  const { s, ana } = await preparar();
  try {
    const vale = await nuevaClienta(ana, { plan: "8 clases al mes" });
    const ia = { tipo: "ia", id: "agente", nombre: "Asistente", rol: "admin" };
    const creado = await ejecutar(s.ctx, "crear_fijo", ia, { clienta: vale, dia: "Sábado", hora: "08:00" });
    assert.equal(creado.reservasCreadas.length, 2);
    assert.deepEqual((await ejecutar(s.ctx, "listar_fijos", ia, { clienta: vale })).map((f) => f.slot), ["Sábado 08:00"]);
    const pausa = await ejecutar(s.ctx, "pausar_fijo", ia, { fijo: "F-0001", cancelarFuturas: true });
    assert.equal(pausa.fijo.estado, "Pausado");
    assert.equal(pausa.reservasCanceladas.length, 2);
    const reg = (await ana.get("/api/admin/registro?limite=50")).json;
    assert.ok(reg.some((x) => x.accion === "fijo.editar" && x.actor.tipo === "ia"));
    await assert.rejects(ejecutar(s.ctx, "crear_fijo", { ...ia, rol: "clienta" }, { clienta: vale, dia: "Sábado", hora: "09:15" }), /solo para el equipo/);
  } finally {
    await s.cerrar();
  }
});
