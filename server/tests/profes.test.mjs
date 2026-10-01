// The profe registers who actually came: walk-ins, closing the roster, the 48 h window, substitute
// requests; the admin assigns only real staff and hears about classes without a profe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, pushFalso, ADMIN, PROFE, LAURA } from "./ayuda.mjs";

const enc = encodeURIComponent;

test("walk-ins: name search without phones, charged to her plan or «vino sin plan» with an alert", async () => {
  const push = pushFalso();
  const s = await arrancar({ semilla: "demo", push });
  try {
    const pasada = s.sembrado.clases.pasada; // yesterday 19:00, Laura's class
    const laura = s.cliente();
    await entrarComo(laura, LAURA);

    assert.equal((await laura.get("/api/profe/clientas?q=v")).status, 422, "at least 2 letters");
    const busca = await laura.get("/api/profe/clientas?q=" + enc("valen"));
    assert.deepEqual(busca.json, [{ id: "C-0001", nombre: "Valentina Ruiz", fichaCompleta: true, primeraVez: false }]);
    assert.equal((await laura.get("/api/profe/clientas?q=3005550101")).json.length, 0, "phones are not searchable");
    assert.ok((await laura.get("/api/profe/clientas?q=" + enc("ia"))).json.length <= 10);

    // Valentina has classes left: «Asistió», charged to her plan
    const v = await laura.post("/api/profe/clases/" + enc(pasada) + "/asistentes", { clienta: "C-0001" });
    assert.equal(v.status, 201, v.texto);
    assert.equal(v.json.sinPlan, false);
    assert.equal(v.json.reserva.estado, "Asistió");
    assert.ok(v.json.clase.gente.some((g) => g.clienta === "C-0001" && g.estado === "Asistió"));
    const fila = s.datos._tablas.Reservas.filas.find((f) => f["ID"] === v.json.reserva.id);
    assert.equal(fila["Origen"], "Profe · " + LAURA.nombre);
    assert.match(fila["Compra"], /^P-/);
    assert.equal((await laura.post("/api/profe/clases/" + enc(pasada) + "/asistentes", { clienta: "C-0001" })).json.motivo, "ya-reservada");

    // Sofía has no classes left: pending «Vino sin plan», alert, novedad, push to admins
    const sofia = await laura.post("/api/profe/clases/" + enc(pasada) + "/asistentes", { clienta: "C-0004" });
    assert.equal(sofia.json.sinPlan, true);
    assert.equal(sofia.json.reserva.estado, "Pendiente de pago");
    await s.ctx.esperarSegundoPlano();
    assert.ok(push.enviados.some((m) => m.a === "admins" && /Vino sin plan: Sofía Pardo/.test(m.titulo)));
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const t = (await ana.get("/api/admin/tablero")).json;
    const alerta = t.alertas.find((a) => a.id === "vino-sin-plan:" + sofia.json.reserva.id);
    assert.equal(alerta.prioridad, 1);
    assert.equal(alerta.accion.tipo, "whatsapp");
    // the expiry job never turns it into «Vencida» (there is no hold), and paying records the attendance
    s.reloj.avanzar(13 * 3600000);
    const conf = await ana.post("/api/admin/reservas/" + sofia.json.reserva.id + "/confirmar", { pago: { plan: "4 clases al mes", medio: "Nequi" } });
    assert.equal(conf.status, 200, conf.texto);
    assert.equal(conf.json.reserva.estado, "Asistió");

    // not her class
    const ximena = s.cliente();
    await entrarComo(ximena, PROFE);
    assert.equal((await ximena.post("/api/profe/clases/" + enc(pasada) + "/asistentes", { clienta: "C-0002" })).status, 403);

    // a full class refuses a walk-in from a profe, not from an admin
    const ocupados = (await ana.get("/api/admin/clases/" + enc(pasada))).json.ocupados;
    await ana.patch("/api/admin/clases/" + enc(pasada), { cupos: ocupados });
    assert.equal((await laura.post("/api/profe/clases/" + enc(pasada) + "/asistentes", { clienta: "C-0002" })).json.motivo, "llena");
    assert.equal((await ana.post("/api/profe/clases/" + enc(pasada) + "/asistentes", { clienta: "C-0002" })).status, 201);
  } finally {
    await s.cerrar();
  }
});

test("closing the roster and the 48-hour window", async () => {
  const s = await arrancar({ semilla: "demo" });
  try {
    const pasada = s.sembrado.clases.pasada;
    const proxima = s.sembrado.clases.proxima;
    const laura = s.cliente();
    await entrarComo(laura, LAURA);
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const antes = (await laura.get("/api/profe/clases/" + enc(pasada))).json;
    assert.equal(antes.asistenciaEditable, true);
    const confirmadas = antes.gente.filter((g) => g.estado === "Confirmada");
    assert.equal(confirmadas.length, 3);

    // she marks one, closes the roster: the other two did not come
    await laura.post("/api/profe/reservas/" + confirmadas[0].reserva + "/asistencia", { vino: true });
    const cerrada = await laura.post("/api/profe/clases/" + enc(pasada) + "/cerrar");
    assert.equal(cerrada.status, 200, cerrada.texto);
    assert.equal(cerrada.json.marcadas, 2);
    assert.equal(cerrada.json.gente.filter((g) => g.estado === "No vino").length, 2);
    assert.equal(cerrada.json.id, pasada, "the answer is the ClaseEquipo itself");

    // a class that has not started cannot be closed
    const temprano = await ana.post("/api/profe/clases/" + enc(proxima) + "/cerrar");
    assert.equal(temprano.status, 409);
    assert.equal(temprano.json.motivo, "no-ha-empezado");

    // 49 hours after the class: only an admin corrects it
    s.reloj.fijar(Date.parse(pasada.replace(" ", "T") + ":00-05:00") + 49 * 3600000);
    assert.equal((await laura.get("/api/profe/clases/" + enc(pasada))).json.asistenciaEditable, false);
    const tarde = await laura.post("/api/profe/reservas/" + confirmadas[1].reserva + "/asistencia", { vino: true });
    assert.equal(tarde.status, 409);
    assert.equal(tarde.json.motivo, "fuera-de-plazo");
    assert.match(tarde.json.mensaje, /48 horas/);
    assert.equal((await laura.post("/api/profe/clases/" + enc(pasada) + "/cerrar")).json.motivo, "fuera-de-plazo");
    const admin = await ana.post("/api/admin/reservas/" + confirmadas[1].reserva + "/asistencia", { vino: true });
    assert.equal(admin.status, 200, admin.texto);
    assert.equal(admin.json.reserva.estado, "Asistió");
  } finally {
    await s.cerrar();
  }
});

test("substitute request → priority alert and push; assigning a real profe closes it and tells her", async () => {
  const push = pushFalso();
  const s = await arrancar({ semilla: "demo", push });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const ximena = s.cliente();
    const yo = await entrarComo(ximena, PROFE);
    const suya = (await ximena.get("/api/profe/clases")).json.find((c) => !c.pasada && c.profe === "Ximena");
    assert.equal(suya.reemplazoPedido, null);

    const r = await ximena.post("/api/profe/clases/" + enc(suya.id) + "/reemplazo", { motivo: "Cita médica" });
    assert.equal(r.status, 200, r.texto);
    assert.equal(r.json.reemplazoPedido.motivo, "Cita médica");
    assert.equal(r.json.reemplazoPedido.pedidoPor, yo.id);
    assert.match(r.json.reemplazoPedido.fecha, /^2026-10-01T15:00:00/);
    assert.equal((await ximena.get("/api/profe/resumen")).json.reemplazosPedidos, 1);
    await s.ctx.esperarSegundoPlano();
    assert.ok(push.enviados.some((m) => m.a === "admins" && /Necesita reemplazo/.test(m.titulo)));
    const alerta = (await ana.get("/api/admin/tablero")).json.alertas.find((a) => a.tipo === "necesita-reemplazo");
    assert.equal(alerta.prioridad, 1);
    assert.equal(alerta.accion.ruta, "/app/admin/agenda/" + enc(suya.id) + "?profe=1");

    // only real, active staff can be assigned
    const mal = await ana.patch("/api/admin/clases/" + enc(suya.id), { profe: "Alguien Inventado" });
    assert.equal(mal.status, 422);
    assert.ok(mal.json.campos.profe);
    const profes = (await ana.get("/api/admin/profes")).json;
    const laura = profes.find((p) => p.nombreHorario === "Laura");
    assert.deepEqual(Object.keys(laura).sort(), ["activa", "id", "nombre", "nombreHorario"]);
    push.enviados.length = 0;
    const cambio = await ana.patch("/api/admin/clases/" + enc(suya.id), { profe: "laura" });
    assert.equal(cambio.status, 200, cambio.texto);
    assert.equal(cambio.json.profe, "Laura", "written as her schedule name");
    assert.equal(cambio.json.reemplazoPedido, null, "a new profe closes the request");
    await s.ctx.esperarSegundoPlano();
    const aviso = push.enviados.find((m) => Array.isArray(m.a) && m.a.includes(laura.id));
    assert.match(aviso.titulo, /^Te asignaron la clase del /);
    assert.ok((await ana.get("/api/admin/novedades")).json.eventos.some((e) => /Profe de la clase/.test(e.titulo)));
    assert.equal((await ana.get("/api/admin/tablero")).json.alertas.filter((a) => a.tipo === "necesita-reemplazo").length, 0);
    assert.equal((await ana.patch("/api/admin/clases/" + enc(suya.id), { profe: "por confirmar" })).json.profe, "Por confirmar");

    // «sin profe» for classes in the next 7 days, and the schedule refuses unknown names too
    const sinProfe = (await ana.get("/api/admin/tablero")).json.alertas.filter((a) => a.tipo === "sin-profe");
    assert.ok(sinProfe.some((a) => a.clase.id === s.sembrado.clases.sinProfe));
    assert.ok(sinProfe.every((a) => a.prioridad === 2 && a.accion.ruta.startsWith("/app/admin/agenda/")));
    assert.equal((await ana.patch("/api/admin/horario/" + enc("Sábado 08:00"), { profe: "Nadie", aplicarAFuturas: true })).status, 422);
    const slot = await ana.patch("/api/admin/horario/" + enc("Sábado 08:00"), { profe: "Ximena", aplicarAFuturas: true });
    assert.equal(slot.status, 200, slot.texto);
    assert.ok(slot.json.clasesActualizadas > 0);

    // a new booking in her class reaches the profe
    push.enviados.length = 0;
    await ana.post("/api/admin/reservas", { clienta: "C-0011", clase: s.sembrado.clases.liberada });
    await s.ctx.esperarSegundoPlano();
    const quien = (await ana.get("/api/admin/clases/" + enc(s.sembrado.clases.liberada))).json.profe;
    const idProfe = profes.find((p) => p.nombreHorario === quien)?.id;
    assert.ok(push.enviados.some((m) => Array.isArray(m.a) && m.a.includes(idProfe) && m.titulo === "Nueva reserva en tu clase"));
  } finally {
    await s.cerrar();
  }
});

test("profe home summary and push subscription", async () => {
  const s = await arrancar({ semilla: "demo" });
  try {
    const laura = s.cliente();
    await entrarComo(laura, LAURA);
    const r = (await laura.get("/api/profe/resumen")).json;
    assert.equal(r.pendientesPorMarcar, 1, "yesterday's class still has attendance to mark");
    assert.ok(r.proximaClase && r.proximaClase.id > "2026-10-01");
    assert.equal(r.reemplazosPedidos, 0);
    assert.deepEqual((await laura.get("/api/profe/push/clave")).json, { activo: false, clavePublica: "" });
    assert.equal((await laura.post("/api/profe/push/suscribir", { endpoint: "https://push.example/x", keys: { p256dh: "x".repeat(20), auth: "y".repeat(10) } })).status, 503);
  } finally {
    await s.cerrar();
  }
  const push = pushFalso();
  const s2 = await arrancar({ semilla: "demo", push });
  try {
    const laura = s2.cliente();
    const yo = await entrarComo(laura, LAURA);
    assert.equal((await laura.get("/api/profe/push/clave")).json.clavePublica, "BPUB-falsa");
    const sub = await laura.post("/api/profe/push/suscribir", { endpoint: "https://push.example/laura", keys: { p256dh: "x".repeat(20), auth: "y".repeat(10) } });
    assert.equal(sub.status, 204);
    assert.deepEqual(push.enviados[0], { a: "suscripcion", usuario: yo.id, endpoint: "https://push.example/laura" });
  } finally {
    await s2.cerrar();
  }
});

test("cancelling a class drops its substitute request (a class with that id never inherits it)", async () => {
  const s = await arrancar({ semilla: "demo" });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const ximena = s.cliente();
    await entrarComo(ximena, PROFE);
    const suya = (await ximena.get("/api/profe/clases")).json.find((c) => !c.pasada && c.profe === "Ximena");
    assert.equal((await ximena.post("/api/profe/clases/" + enc(suya.id) + "/reemplazo", { motivo: "Viaje" })).status, 200);
    assert.ok(s.ctx.db.prepare("SELECT 1 FROM reemplazos WHERE clase = ?").get(suya.id));
    const r = await ana.post("/api/admin/clases/" + enc(suya.id) + "/cancelar", { motivo: "Prueba" });
    assert.equal(r.status, 200, r.texto);
    assert.equal(s.ctx.db.prepare("SELECT 1 FROM reemplazos WHERE clase = ?").get(suya.id), undefined);
    assert.equal((await ana.get("/api/admin/tablero")).json.alertas.filter((a) => a.tipo === "necesita-reemplazo" && a.clase?.id === suya.id).length, 0);
  } finally {
    await s.cerrar();
  }
});
