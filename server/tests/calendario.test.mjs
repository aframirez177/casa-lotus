// Waiting list, extra classes, the weekly template, class cancellation and the maintenance jobs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, reservaWeb, whatsappFalso, ADMIN } from "./ayuda.mjs";
import { tareaDiaria, tareaFrecuente } from "../src/tareas/index.js";

const SAB_0800 = "2026-10-03 08:00";

test("waiting list: a freed swing raises «cupo-liberado» and WhatsApps the first in line", async () => {
  const wa = whatsappFalso();
  const s = await arrancar({ whatsapp: wa });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    await ana.patch("/api/admin/clases/" + encodeURIComponent(SAB_0800), { cupos: 2 });
    const a = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { nombre: "Ana Uno", whatsapp: "3155550011" }));
    const b = s.cliente();
    const rb = await b.post("/api/publico/reservas", reservaWeb(SAB_0800, { nombre: "Bea Dos", whatsapp: "3155550012" }));
    assert.equal(a.status, 201);
    assert.equal(rb.status, 201);

    // a third person: the class is full, so the waiting list
    const lleno = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { nombre: "Caro Tres", whatsapp: "3155550013" }));
    assert.equal(lleno.json.motivo, "llena");
    const espera = await s.cliente().post("/api/publico/espera", {
      clase: SAB_0800, nombre: "Caro Tres", whatsapp: "3155550013", consentimientos: { datos: { acepta: true } }, website: "",
    });
    assert.equal(espera.status, 201, espera.texto);
    assert.match(espera.json.id, /^E-\d{4}$/);
    const lista = await ana.get("/api/admin/espera");
    assert.equal(lista.json[0].nombre, "Caro Tres");
    assert.equal(lista.json[0].clase.id, SAB_0800);

    // Bea cancels: the swing frees up
    await s.ctx.esperarSegundoPlano();
    wa.enviados.length = 0;
    const c = await b.post("/api/yo/reservas/" + rb.json.codigo + "/cancelar");
    assert.equal(c.status, 200, c.texto);
    await s.ctx.esperarSegundoPlano();
    const t = await ana.get("/api/admin/tablero");
    const alerta = t.json.alertas.find((x) => x.tipo === "cupo-liberado");
    assert.ok(alerta, "the alert is on the dashboard");
    assert.equal(alerta.prioridad, 1);
    assert.equal(alerta.accion.tipo, "whatsapp");
    const nov = await ana.get("/api/admin/novedades");
    assert.ok(nov.json.eventos.some((e) => e.tipo === "espera" && /Se liberó un cupo/.test(e.titulo)));
    const plantilla = wa.enviados.find((m) => m.nombre === "cupo_liberado");
    assert.ok(plantilla, "the first in line got the WhatsApp template");
    assert.equal(plantilla.whatsapp, "573155550013");
    assert.equal(plantilla.variables.nombre, "Caro");
    assert.match(plantilla.variables.cuando, /sábado 3 de octubre a las 8:00 a\. m\./);
    const fila = s.datos._tablas.Espera.filas.find((f) => f["ID"] === espera.json.id);
    assert.equal(fila["Estado"], "Avisada");

    // Ana gives her the swing
    const tomar = await ana.post("/api/admin/espera/" + espera.json.id + "/tomar");
    assert.equal(tomar.status, 200, tomar.texto);
    assert.equal(tomar.json.reserva.estado, "Pendiente de pago");
    assert.equal(tomar.json.clase.libres, 0);
  } finally {
    await s.cerrar();
  }
});

test("extra class: refused on a holiday unless forced, never over an existing class", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const base = { hora: "18:00", clase: "Pilates Aéreo", profe: "Laura", cupos: 6 };
    const festivo = await ana.post("/api/admin/clases", { ...base, fecha: "2026-10-12" });
    assert.equal(festivo.status, 409);
    assert.deepEqual(festivo.json, { ok: false, error: "conflicto", motivo: "festivo", mensaje: "El 12 de octubre es festivo (Día de la Raza). ¿Crearla igual?" });
    const forzada = await ana.post("/api/admin/clases", { ...base, fecha: "2026-10-12", forzar: true });
    assert.equal(forzada.status, 201, forzada.texto);
    assert.equal(forzada.json.tipo, "Extra");
    assert.equal(forzada.json.cupos, 6);
    const normal = await ana.post("/api/admin/clases", { ...base, fecha: "2026-10-09" });
    assert.equal(normal.status, 201);
    const repetida = await ana.post("/api/admin/clases", { ...base, fecha: "2026-10-09" });
    assert.equal(repetida.status, 409);
    const pasada = await ana.post("/api/admin/clases", { ...base, fecha: "2026-09-01" });
    assert.equal(pasada.status, 422);
    const disp = await s.cliente().get("/api/publico/disponibilidad?dias=14");
    assert.ok(disp.json.clases.some((c) => c.id === "2026-10-09 18:00" && c.tipo === "Extra" && c.reservable));

    // cupos never below what is booked
    await s.cliente().post("/api/publico/reservas", reservaWeb("2026-10-09 18:00", { whatsapp: "3155550021" }));
    await s.cliente().post("/api/publico/reservas", reservaWeb("2026-10-09 18:00", { whatsapp: "3155550022", nombre: "Otra Más" }));
    const menos = await ana.patch("/api/admin/clases/" + encodeURIComponent("2026-10-09 18:00"), { cupos: 1 });
    assert.equal(menos.status, 422);
    assert.equal(menos.json.campos.cupos, "Mínimo 2.");
  } finally {
    await s.cerrar();
  }
});

test("a new schedule slot creates its classes at once and skips holidays", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const nuevo = await ana.post("/api/admin/horario", { dia: "Lunes", hora: "18:00", clase: "Pilates Aéreo", profe: "Laura", cupos: 6 });
    assert.equal(nuevo.status, 201, nuevo.texto);
    assert.equal(nuevo.json.slot.id, "Lunes 18:00");
    // Mondays up to the 4-week horizon (29 Oct): 5, 19, 26 — 12 Oct is Día de la Raza
    assert.equal(nuevo.json.clasesCreadas, 3);
    const ag = await ana.get("/api/admin/agenda?desde=2026-10-01&hasta=2026-10-31");
    const lunes = ag.json.filter((c) => c.dia === "Lunes").map((c) => c.fecha);
    assert.deepEqual(lunes, ["2026-10-05", "2026-10-19", "2026-10-26"]);
    assert.equal(ag.json.find((c) => c.fecha === "2026-10-05").cupos, 6);
    assert.equal((await ana.post("/api/admin/horario", { dia: "Lunes", hora: "18:00", clase: "X", profe: "Laura", cupos: 6 })).status, 409);

    // edit and apply to future classes
    const ed = await ana.patch("/api/admin/horario/" + encodeURIComponent("Lunes 18:00"), { profe: "Geral", aplicarAFuturas: true });
    assert.equal(ed.json.clasesActualizadas, 3);
    assert.equal((await ana.get("/api/admin/agenda?desde=2026-10-05&hasta=2026-10-05")).json[0].profe, "Geral");

    // deactivate: classes without bookings are cancelled, those with bookings are returned
    await s.cliente().post("/api/publico/reservas", reservaWeb("2026-10-19 18:00", { whatsapp: "3155550031" }));
    const fuera = await ana.del("/api/admin/horario/" + encodeURIComponent("Lunes 18:00"));
    assert.equal(fuera.status, 200, fuera.texto);
    assert.equal(fuera.json.canceladas, 2);
    assert.deepEqual(fuera.json.conReservas.map((c) => c.id), ["2026-10-19 18:00"]);
    const h = await ana.get("/api/admin/horario");
    assert.equal(h.json.find((x) => x.id === "Lunes 18:00").activa, false);

    // the daily job keeps the horizon and never duplicates or touches existing classes
    const antes = s.datos._tablas.Clases.filas.length;
    assert.equal(await tareaDiaria(s.ctx), 0);
    s.reloj.avanzar(7 * 86400000);
    const creadas = await tareaDiaria(s.ctx);
    assert.equal(creadas, 4, "one more week of Wed + Sat");
    assert.equal(s.datos._tablas.Clases.filas.length, antes + 4);
    const ids = s.datos._tablas.Clases.filas.map((f) => f["ID"]);
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    await s.cerrar();
  }
});

test("cancelling a class gives every booking back (late ones too) with WhatsApp texts", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const p1 = s.cliente();
    const r1 = await p1.post("/api/publico/reservas", reservaWeb(SAB_0800, { whatsapp: "3155550041", nombre: "Uno Persona" }));
    const r2 = await s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { whatsapp: "3155550042", nombre: "Dos Persona" }));
    await ana.post("/api/admin/reservas/" + r2.json.codigo + "/confirmar", { pago: { plan: "8 clases al mes", medio: "Nequi" } });
    s.reloj.fijar(Date.parse("2026-10-03T05:00:00-05:00"));
    const tarde = await ana.post("/api/admin/reservas/" + r2.json.codigo + "/cancelar", {});
    assert.equal(tarde.json.reserva.estado, "Cancelada tarde");
    const c = await ana.post("/api/admin/clases/" + encodeURIComponent(SAB_0800) + "/cancelar", { motivo: "La profe está enferma" });
    assert.equal(c.status, 200, c.texto);
    assert.equal(c.json.clase.estado, "Cancelada");
    assert.equal(c.json.afectadas.length, 1, "only who was still coming gets a message");
    assert.match(c.json.afectadas[0].waTexto, /tuvimos que cancelar la clase del sábado 3 de octubre a las 8:00 a\. m\./);
    const filas = s.datos._tablas.Reservas.filas.filter((f) => f["Clase"] === SAB_0800);
    assert.ok(filas.every((f) => f["Estado"] === "Cancelada" && f["Notas"] === "Clase cancelada"));
    assert.equal((await ana.get("/api/admin/clientas/C-0002")).json.saldo.clases, 8, "the late one got her class back too");
    assert.equal(r1.status, 201);
  } finally {
    await s.cerrar();
  }
});

test("unpaid holds expire on their own and free the swing", async () => {
  const s = await arrancar();
  try {
    const r = await s.cliente().post("/api/publico/reservas", reservaWeb("2026-10-07 18:00"));
    assert.equal(r.status, 201);
    assert.equal(await tareaFrecuente(s.ctx), 0);
    s.reloj.avanzar(12 * 3600000 + 1000);
    assert.equal(await tareaFrecuente(s.ctx), 1);
    const fila = s.datos._tablas.Reservas.filas[0];
    assert.equal(fila["Estado"], "Vencida");
    assert.match(fila["Notas"], /Sin pago a tiempo/);
  } finally {
    await s.cerrar();
  }
});

test("the pending booking carries the plan she asked for; admin adds someone to a waiting list", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    await s.cliente().post("/api/publico/reservas", { ...reservaWeb(SAB_0800, { whatsapp: "3155550401" }), plan: "8 clases al mes" });
    await s.cliente().post("/api/publico/reservas", reservaWeb(SAB_0800, { whatsapp: "3155550402", nombre: "Sin Plan Elegido" }));
    const pend = (await ana.get("/api/admin/tablero")).json.pendientes;
    assert.equal(pend.find((p) => p.whatsapp === "573155550401").plan, "8 clases al mes");
    assert.equal(pend.find((p) => p.whatsapp === "573155550402").plan, "Clase de prueba", "default: the trial");
    const fila = s.datos._tablas.Reservas.filas.find((f) => f["Clienta"] === "C-0001");
    assert.equal(JSON.parse(fila["Atribución"]).plan, "8 clases al mes", "stored compactly in «Atribución», no new column");

    // admin waiting list: any class (even with swings left), never twice, never a cancelled class
    const e = await ana.post("/api/admin/espera", { clienta: "C-0002", clase: "2026-10-07 18:00" });
    assert.equal(e.status, 201, e.texto);
    assert.match(e.json.id, /^E-\d{4}$/);
    assert.equal(e.json.estado, "Esperando");
    assert.equal(e.json.nombre, "Sin Plan Elegido");
    const otra = await ana.post("/api/admin/espera", { clienta: "C-0002", clase: "2026-10-07 18:00" });
    assert.equal(otra.status, 409);
    assert.equal(otra.json.motivo, "ya-reservada");
    assert.equal((await ana.post("/api/admin/espera", { clienta: "C-0002", clase: "2026-10-30 18:00" })).status, 404);
    await ana.post("/api/admin/clases/" + encodeURIComponent("2026-10-07 19:00") + "/cancelar", { motivo: "Prueba" });
    assert.equal((await ana.post("/api/admin/espera", { clienta: "C-0002", clase: "2026-10-07 19:00" })).json.motivo, "cancelada");
    assert.equal((await ana.post("/api/admin/espera", { clienta: "C-0001", clase: SAB_0800 })).json.motivo, "ya-reservada", "already booked in it");
  } finally {
    await s.cerrar();
  }
});
