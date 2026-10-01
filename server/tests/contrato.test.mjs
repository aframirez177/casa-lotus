// Every endpoint of CONTRATO §6 answers with the documented shape (smoke over the demo studio).
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, ADMIN, PROFE } from "./ayuda.mjs";

const llaves = (o, ...ks) => { for (const k of ks) assert.ok(k in o, "falta «" + k + "» en " + JSON.stringify(o).slice(0, 200)); };

test("admin, profe and clienta endpoints answer the contract shapes", async () => {
  const s = await arrancar({ semilla: "demo" });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const ok = async (p) => { const r = await p; assert.ok(r.status < 300, r.status + " " + r.texto.slice(0, 300)); return r.json; };

    const t = await ok(ana.get("/api/admin/tablero"));
    llaves(t, "hoy", "hoyTexto", "saludo", "kpis", "hoyClases", "manana", "porMarcar", "pendientes", "alertas", "segmentos");
    llaves(t.kpis, "semana", "mes", "clientasActivas", "pendientesPago", "enEspera");
    llaves(t.pendientes[0], "reserva", "clienta", "nombre", "whatsapp", "clase", "creada", "venceApartado", "saldo", "origen", "waTexto", "waEnlace");
    llaves(t.alertas[0], "id", "tipo", "prioridad", "titulo", "detalle");

    const ag = await ok(ana.get("/api/admin/agenda"));
    llaves(ag[0], "id", "fecha", "dia", "hora", "fechaTexto", "horaTexto", "clase", "tipo", "cupos", "ocupados", "libres", "reservable", "estado",
      "profe", "notas", "esHoy", "pasada", "pocaGente", "gente", "espera");
    const conGente = ag.find((c) => c.gente.length);
    llaves(conGente.gente[0], "reserva", "clienta", "nombre", "whatsapp", "whatsappTexto", "estado", "primeraVez", "experiencia", "salud", "cumple",
      "autorizaImagen", "contactoEmergencia", "origen");

    const lib = await ok(ana.post("/api/admin/reservas/" + t.pendientes[0].reserva + "/liberar"));
    assert.equal(lib.reserva.estado, "Vencida");
    assert.equal((await ana.post("/api/admin/reservas/" + t.pendientes[0].reserva + "/liberar")).status, 409);
    const una = await ok(ana.get("/api/admin/clases/" + encodeURIComponent(lib.clase.id)));
    assert.equal(una.id, lib.clase.id);
    const origen = ag.find((c) => !c.pasada && c.gente.some((g) => g.estado === "Confirmada"));
    const mover = origen.gente.find((g) => g.estado === "Confirmada");
    const destino = ag.find((c) => !c.pasada && c.libres > 0 && c.id !== origen.id && !c.gente.some((g) => g.clienta === mover.clienta));
    const reag = await ok(ana.post("/api/admin/reservas/" + mover.reserva + "/reagendar", { clase: destino.id }));
    assert.equal(reag.anterior.estado, "Cancelada");
    assert.equal(reag.nueva.reagendadaDe, mover.reserva);

    const h = await ok(ana.get("/api/admin/horario"));
    llaves(h[0], "id", "dia", "hora", "clase", "profe", "cupos", "activa", "proximas");
    const cl = await ok(ana.get("/api/admin/clientas?orden=saldo"));
    llaves(cl[0], "id", "nombre", "whatsapp", "whatsappTexto", "correo", "desde", "llego", "etapa", "segmentos", "saldo", "proxima", "ultimaVisita",
      "visitas30", "etiquetas", "fichaCompleta");
    const det = await ok(ana.get("/api/admin/clientas/C-0001"));
    llaves(det, "perfil", "consentimientos", "notas", "compras", "reservas", "espera", "linea");
    llaves(det.reservas[0], "id", "estado", "clase", "puedeCancelar", "cancelarSinCosto", "limiteCancelar", "puedeReagendar", "limiteReagendar");
    llaves(det.compras[0], "id", "fecha", "clienta", "nombre", "plan", "clases", "valor", "medio", "inicio", "vence", "usadas", "disponibles", "estado");
    const ed = await ok(ana.patch("/api/admin/clientas/C-0011", { barrio: "Chapinero", etiquetas: ["instagram"], notas: "Quiere sábado." }));
    assert.equal(ed.perfil.barrio, "Chapinero");
    assert.deepEqual(ed.etiquetas, ["instagram"]);
    assert.equal((await ana.post("/api/admin/clientas", { nombre: "Repetida", whatsapp: "3005550101" })).status, 409);

    const pagos = await ok(ana.get("/api/admin/pagos?mes=2026-09"));
    llaves(pagos, "mes", "total", "porMedio", "porPlan", "compras");
    assert.ok(pagos.total > 0);
    const planes = await ok(ana.get("/api/admin/planes"));
    assert.ok(planes.find((p) => p.nombre === "8 clases al mes"));
    const pl = await ok(ana.patch("/api/admin/planes", { nombre: "Clase de prueba", precio: 30000 }));
    assert.equal(pl.find((p) => p.nombre === "Clase de prueba").precio, 30000);
    const pub = await (s.cliente()).get("/api/publico/planes");
    assert.equal(pub.json.find((p) => p.nombre === "Clase de prueba").precio, 30000);

    const esp = await ok(ana.get("/api/admin/espera"));
    llaves(esp[0], "id", "clienta", "nombre", "whatsapp", "creada", "estado", "clase");
    const ya = await ok(ana.patch("/api/admin/espera/" + esp[esp.length - 1].id, { estado: "Ya no" }));
    assert.equal(ya.estado, "Ya no");

    const eq = await ok(ana.get("/api/admin/equipo"));
    llaves(eq[0], "id", "rol", "nombre", "nombreHorario", "correo", "whatsapp", "activa", "bio", "foto", "creada", "ultimoAcceso", "clasesMes", "pagoMes");
    const aj = await ok(ana.get("/api/admin/ajustes"));
    llaves(aj[0], "ajuste", "valor", "ayuda");
    assert.equal((await ana.patch("/api/admin/ajustes", { "Correo para avisos": "no-es-correo" })).status, 422);
    assert.equal((await ana.patch("/api/admin/ajustes", { "Llave de pago": "4567 8901 2345 6789" })).status, 422, "never a bank account number");
    const aj2 = await ok(ana.patch("/api/admin/ajustes", { "Horas mínimas para cancelar": 8 }));
    assert.equal(aj2.find((x) => x.ajuste === "Horas mínimas para cancelar").valor, 8);
    assert.equal((await s.cliente().get("/api/publico/estudio")).json.politicas.horasCancelar, 8);

    const reg = await ok(ana.get("/api/admin/registro?limite=5"));
    llaves(reg[0], "ts", "actor", "accion", "objeto", "detalle");
    assert.ok(!JSON.stringify(await ok(ana.get("/api/admin/registro?limite=500"))).includes("Pago por clase a profes\":1"), "the teacher rate never lands in the log");

    await s.cliente().post("/api/publico/eventos", { tipo: "cta", ref: "WEB-HERO", pagina: "/", utm: { source: "google", campaign: "prueba-octubre" } }, { sinCsrf: true });
    const at = await ok(ana.get("/api/admin/atribucion?desde=2026-09-01&hasta=2026-10-31"));
    const hero = at.porRef.find((x) => x.ref === "WEB-HERO");
    assert.equal(hero.clics, 1);
    assert.equal(hero.reservas, 1);
    assert.ok(at.porCampana.find((x) => x.campana === "prueba-octubre"));

    const sal = await ok(ana.get("/api/admin/salud"));
    llaves(sal, "datos", "hoja", "whatsapp", "correo", "push", "version");
    assert.equal(sal.datos, "memoria");
    assert.equal(sal.hoja.ok, true);
    assert.equal(sal.push.activo, false);

    // the profe: summary, notes
    const profe = s.cliente();
    await entrarComo(profe, PROFE);
    const res = await ok(profe.get("/api/profe/resumen?mes=2026-09"));
    llaves(res, "mes", "clasesDictadas", "asistentes", "proximas", "ocupacionPct");
    assert.ok(res.clasesDictadas > 0);
    const suya = (await ok(profe.get("/api/profe/clases"))).find((c) => !c.pasada);
    const nota = await ok(profe.post("/api/profe/clases/" + encodeURIComponent(suya.id) + "/notas", { texto: "Traer bloques." }));
    assert.equal(nota.notas, "Traer bloques.");

    // a clienta with a full session: profile, consents, waiting list
    const acc = await ok(ana.post("/api/admin/clientas/C-0007/acceso"));
    const ella = s.cliente();
    await ella.get("/api/auth/enlace/" + acc.enlace.split("/").pop());
    const yo = await ok(ella.get("/api/yo"));
    llaves(yo, "clienta", "saldo", "compras", "proximas", "historial", "espera", "politicas", "pago", "limitada");
    assert.equal(yo.espera.length, 1, "Lucía is waiting for the full class");
    const per = await ella.patch("/api/yo/perfil", { barrio: "Usaquén", salud: "Asma leve" });
    assert.equal(per.status, 422, "health text needs the sensitive-data consent first");
    assert.ok(per.json.campos["consentimientos.sensibles"]);
    const con = await ok(ella.post("/api/yo/consentimientos", { sensibles: { acepta: true }, novedades: { acepta: true } }));
    assert.equal(con.consentimientos.sensibles.acepta, true);
    assert.equal(con.consentimientos.novedades.acepta, true);
    const per2 = await ok(ella.patch("/api/yo/perfil", { barrio: "Usaquén", salud: "Asma leve" }));
    assert.equal(per2.perfil.salud, "Asma leve");
    assert.equal((await ella.patch("/api/yo/perfil", { whatsapp: "3001234567" })).status, 422);
    const revoca = await ok(ella.post("/api/yo/consentimientos", { sensibles: { acepta: false } }));
    assert.equal(revoca.consentimientos.sensibles.acepta, false);
    assert.equal((await ok(ella.get("/api/yo"))).clienta.perfil.salud, "", "revoking erases the health answer");
    assert.equal((await ella.del("/api/yo/espera/" + yo.espera[0].id)).status, 204);
    assert.equal((await ok(ella.get("/api/yo"))).espera.length, 0);

    // Web Push is off without VAPID keys
    assert.equal((await ana.post("/api/admin/push/suscribir", { endpoint: "https://push.example/x", keys: { p256dh: "x".repeat(20), auth: "y".repeat(10) } })).status, 503);
    // unknown routes
    assert.equal((await ana.get("/api/admin/no-existe")).status, 404);
    assert.equal((await ana.get("/api/admin/whatsapp/estado")).status < 500, true);
  } finally {
    await s.cerrar();
  }
});

test("SSE stream: an event published reaches the open stream", async () => {
  const s = await arrancar();
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const ctrl = new AbortController();
    const r = await fetch(s.base + "/api/admin/stream", { headers: { cookie: ana.cookie }, signal: ctrl.signal });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/event-stream/);
    const lector = r.body.getReader();
    s.ctx.novedades.publicar({ tipo: "sistema", titulo: "Hola stream" });
    let texto = "";
    while (!texto.includes("Hola stream")) texto += new TextDecoder().decode((await lector.read()).value);
    assert.match(texto, /event: evento\ndata: \{.*"titulo":"Hola stream"/);
    ctrl.abort();
    assert.equal((await s.cliente().get("/api/admin/stream")).status, 401);
  } finally {
    await s.cerrar();
  }
});
