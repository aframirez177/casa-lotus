// The seeded studio lights up every segment, stage and alert; public endpoints never leak people.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, entrarComo, ADMIN } from "./ayuda.mjs";
import { ejecutar, catalogo } from "../src/herramientas/index.js";

test("segments and stage of the seeded people", async () => {
  const s = await arrancar({ semilla: "demo" });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const filas = (await ana.get("/api/admin/clientas")).json;
    const de = (nombre) => filas.find((f) => f.nombre.startsWith(nombre));
    const tiene = (nombre, ...segs) => { for (const x of segs) assert.ok(de(nombre).segmentos.includes(x), nombre + " ∈ " + x + " (" + de(nombre).segmentos + ")"); };

    tiene("Valentina", "con-clases", "agendadas");
    assert.equal(de("Valentina").etapa, "activa");
    tiene("Camila", "poquitas", "con-clases");
    assert.equal(de("Camila").saldo.clases, 1);
    assert.equal(de("Camila").etapa, "en-riesgo");
    tiene("Daniela", "vence-pronto");
    assert.equal(de("Daniela").saldo.vence, "2026-10-04");
    tiene("Sofía", "sin-clases");
    assert.equal(de("Sofía").saldo.clases, 0);
    tiene("Mariana", "prueba");
    assert.equal(de("Mariana").etapa, "prueba");
    tiene("Isabela", "pendiente-pago", "nuevas", "leads", "agendadas");
    assert.equal(de("Isabela").etapa, "lead");
    tiene("Paula", "cumple");
    tiene("Natalia", "ficha-incompleta", "nuevas");
    tiene("Andrea", "inactivas");
    assert.equal(de("Andrea").etapa, "inactiva");
    tiene("Juliana", "leads");
    assert.equal(de("Juliana").etapa, "lead");

    const segs = (await ana.get("/api/admin/segmentos")).json;
    for (const x of segs) assert.ok(x.total > 0, "segment " + x.id + " has people");
    assert.equal((await ana.get("/api/admin/clientas?segmento=poquitas")).json.length, segs.find((x) => x.id === "poquitas").total);
    assert.equal((await ana.get("/api/admin/clientas?q=valen")).json[0].nombre, "Valentina Ruiz");
    assert.equal((await ana.get("/api/admin/clientas?q=0110")).json[0].nombre, "Andrea Castillo");

    const t = (await ana.get("/api/admin/tablero")).json;
    const tipos = new Set(t.alertas.map((a) => a.tipo));
    for (const x of ["pago-por-vencer", "sin-marcar", "poca-gente", "saldo-bajo", "vence-pronto", "sin-clases", "prueba-sin-plan", "cumple", "cupo-liberado", "ficha-incompleta",
      "vino-sin-plan", "sin-profe"]) {
      assert.ok(tipos.has(x), "alert " + x);
    }
    const prioridades = t.alertas.map((a) => a.prioridad);
    assert.deepEqual(prioridades, [...prioridades].sort(), "ordered by urgency");
    assert.ok(t.kpis.semana.pct > 0 && t.kpis.semana.cupos > 0);
    assert.equal(t.kpis.mes.pagoProfes, null, "teacher cost hidden while the setting is empty");
    assert.equal(t.porMarcar.length, 1);
    assert.equal(t.pendientes[0].origen, "Web · WEB-HERO");
    assert.ok(t.manana.some((c) => c.tipo === "Extra"));

    // the clienta detail: profile, consents, timeline
    const d = (await ana.get("/api/admin/clientas/C-0003")).json;
    assert.equal(d.perfil.salud, "Lesión antigua en la rodilla derecha: evita impactos.");
    assert.equal(d.consentimientos.sensibles.acepta, true);
    assert.equal(d.consentimientos.imagen.acepta, false);
    assert.ok(d.linea.some((e) => e.tipo === "pago") && d.linea.some((e) => e.tipo === "reserva"));
    assert.equal((await ana.get("/api/admin/clientas/C-0001")).json.consentimientos.novedades.acepta, true);
    assert.ok(!(await ana.get("/api/admin/clientas/C-0001")).json.etiquetas.includes("novedades-whatsapp"), "the opt-in tag is not a visible tag");

    // setting the teacher rate in the Sheet shows the cost
    await ana.patch("/api/admin/ajustes", { "Pago por clase a profes": 1000 });
    const t2 = (await ana.get("/api/admin/tablero")).json;
    assert.equal(t2.kpis.mes.pagoProfes, t2.kpis.mes.clasesDictadas * 1000);
  } finally {
    await s.cerrar();
  }
});

test("public endpoints carry counts only: no names, no phones, no e-mails", async () => {
  const s = await arrancar({ semilla: "demo" });
  try {
    const anon = s.cliente();
    const cuerpos = [
      (await anon.get("/api/publico/disponibilidad?dias=30")).texto,
      (await anon.get("/api/publico/planes")).texto,
      (await anon.get("/api/publico/estudio")).texto,
    ].join("\n");
    const clientas = s.datos._tablas.Clientas.filas;
    for (const c of clientas) {
      assert.ok(!cuerpos.includes(c["Nombre"].split(" ")[0]), "name " + c["Nombre"]);
      assert.ok(!cuerpos.includes(String(c["WhatsApp"]).slice(2)), "phone of " + c["Nombre"]);
      if (c["Correo"]) assert.ok(!cuerpos.includes(c["Correo"]), "e-mail of " + c["Nombre"]);
    }
    for (const prohibido of ["Ximena", "Laura", "Geral", "salud", "gente"]) assert.ok(!cuerpos.includes('"' + prohibido), prohibido);
    const disp = JSON.parse(cuerpos.split("\n")[0]);
    assert.ok(disp.clases.every((c) => Object.keys(c).every((k) => ["id", "fecha", "dia", "hora", "fechaTexto", "horaTexto", "clase", "tipo", "cupos", "ocupados", "libres", "reservable", "motivo", "estado"].includes(k))));
    assert.ok(disp.clases.find((c) => c.motivo === "llena"));
    // and nothing else is reachable without a session
    for (const ruta of ["/api/admin/tablero", "/api/admin/clientas", "/api/profe/clases", "/api/yo"]) assert.equal((await anon.get(ruta)).status, 401, ruta);
  } finally {
    await s.cerrar();
  }
});

test("tool catalog: JSON schemas, roles, the same domain functions, audited as «ia»", async () => {
  const s = await arrancar({ semilla: "demo" });
  try {
    const cat = catalogo({ rol: "admin" });
    for (const n of ["buscar_clientas", "ver_clienta", "ver_agenda", "ver_disponibilidad", "reservar_clase", "cancelar_reserva", "reagendar_reserva",
      "registrar_pago", "confirmar_reserva", "ver_lista_de_espera", "ver_tablero"]) {
      const h = cat.find((x) => x.nombre === n);
      assert.ok(h, n);
      assert.equal(h.esquema.type, "object");
      assert.ok(h.descripcion.length > 40);
    }
    const ia = { tipo: "ia", id: "agente", nombre: "Asistente", rol: "admin" };
    const poquitas = await ejecutar(s.ctx, "buscar_clientas", ia, { segmento: "poquitas" });
    assert.ok(poquitas.some((c) => c.nombre === "Camila Torres"));
    await assert.rejects(ejecutar(s.ctx, "buscar_clientas", { tipo: "ia", rol: "clienta" }, {}), /administrador/);
    await assert.rejects(ejecutar(s.ctx, "ver_clienta", ia, { id: "nadie" }), (e) => e.codigo === "validacion");
    const disp = await ejecutar(s.ctx, "ver_disponibilidad", ia, { dias: 14 });
    const libre = disp.clases.find((c) => c.reservable && c.libres > 0);
    const r = await ejecutar(s.ctx, "reservar_clase", ia, { clienta: "C-0011", clase: libre.id });
    assert.equal(r.reserva.estado, "Pendiente de pago");
    const reg = s.ctx.db.prepare("SELECT * FROM registro WHERE actor_tipo = 'ia'").all().map((x) => x.accion);
    assert.ok(reg.includes("ia.reservar_clase") && reg.includes("reserva.crear"));
  } finally {
    await s.cerrar();
  }
});
