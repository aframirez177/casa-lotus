// Fixes from the QA pass (e2e/HALLAZGOS.md): CRM sorting and segments, ungendered teachers, the
// admin roster with cancelled bookings, a neutral sample phone, and a booking's attribution for admins.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { arrancar, entrarComo, reservaWeb, ADMIN, LAURA } from "./ayuda.mjs";

const enc = encodeURIComponent;

test("CRM: five sort orders; a segment lists exactly its count; stages have their own filter", async () => {
  const s = await arrancar({ semilla: "demo" });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    // someone who bought a trial but has not come yet: stage «prueba», but not the segment «Vinieron a prueba»
    const r = await s.cliente().post("/api/publico/reservas", reservaWeb(s.sembrado.clases.liberada, { whatsapp: "3155550501", nombre: "Trial Pendiente" }));
    await ana.post("/api/admin/reservas/" + r.json.codigo + "/confirmar", { pago: { plan: "Clase de prueba", medio: "Nequi" } });

    for (const orden of ["nombre", "reciente", "saldo", "proxima", "visita"]) {
      assert.equal((await ana.get("/api/admin/clientas?orden=" + orden)).status, 200, orden);
    }
    assert.equal((await ana.get("/api/admin/clientas?orden=otra")).status, 422);

    const prox = (await ana.get("/api/admin/clientas?orden=proxima")).json;
    const conClase = prox.filter((f) => f.proxima);
    assert.ok(conClase.length > 0 && conClase.length < prox.length);
    assert.deepEqual(prox.slice(0, conClase.length).map((f) => f.id), conClase.map((f) => f.id), "booked first, nobody booked last");
    const ids = conClase.map((f) => f.proxima.id);
    assert.deepEqual(ids, [...ids].sort(), "soonest class first");
    const vis = (await ana.get("/api/admin/clientas?orden=visita")).json.map((f) => f.ultimaVisita);
    const conVisita = vis.filter(Boolean);
    assert.deepEqual(conVisita, [...conVisita].sort().reverse(), "most recent visit first");
    assert.deepEqual(vis.slice(conVisita.length), vis.filter((v) => !v), "never came: last");

    const segs = (await ana.get("/api/admin/segmentos")).json;
    for (const x of segs) {
      const lista = (await ana.get("/api/admin/clientas?segmento=" + x.id)).json;
      assert.equal(lista.length, x.total, "segment " + x.id);
      assert.ok(lista.every((f) => f.segmentos.includes(x.id)));
    }
    const trial = (await ana.get("/api/admin/clientas?q=trial")).json[0];
    assert.equal(trial.etapa, "prueba");
    assert.ok(!trial.segmentos.includes("prueba"), "she has not come yet");
    assert.ok(!(await ana.get("/api/admin/clientas?segmento=prueba")).json.some((f) => f.id === trial.id));
    const etapa = (await ana.get("/api/admin/clientas?etapa=prueba")).json;
    assert.ok(etapa.some((f) => f.id === trial.id) && etapa.every((f) => f.etapa === "prueba"));
    assert.equal((await ana.get("/api/admin/clientas?segmento=no-existe")).status, 422);
  } finally {
    await s.cerrar();
  }
});

test("server texts never gender the teachers", () => {
  const raiz = fileURLToPath(new URL("../src/", import.meta.url));
  const archivos = [];
  const recorrer = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== "whatsapp") recorrer(p); } // the WhatsApp module has its own checks
      else if (n.endsWith(".js")) archivos.push(p);
    }
  };
  recorrer(raiz);
  const malos = [];
  const reglas = [/\b(la|una|el|un|las|unas|los|unos|nueva|nuevo|otra|otro|esta|este)\s+profes?\b/i, /\bprofesoras?\b/i, /\bprofesor(es)?\b/i];
  for (const f of archivos) {
    readFileSync(f, "utf8").split("\n").forEach((linea, i) => {
      // only strings: comments in English never matter
      const textos = linea.match(/"[^"]*"|'[^']*'|`[^`]*`/g) || [];
      for (const t of textos) if (reglas.some((r) => r.test(t))) malos.push(f.replace(raiz, "src/") + ":" + (i + 1) + " " + t);
    });
  }
  assert.deepEqual(malos, []);
});

test("admin roster keeps cancelled and expired bookings; the profe sees who is coming", async () => {
  const s = await arrancar({ semilla: "demo" });
  try {
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    const id = s.sembrado.clases.liberada;
    const r = await s.cliente().post("/api/publico/reservas", reservaWeb(id, { whatsapp: "3155550601", nombre: "Cancela Pronto" }));
    await ana.post("/api/admin/reservas/" + r.json.codigo + "/liberar");
    const r2 = await s.cliente().post("/api/publico/reservas", reservaWeb(id, { whatsapp: "3155550602", nombre: "Cancela Luego" }));
    await ana.post("/api/admin/reservas/" + r2.json.codigo + "/cancelar", {});
    const admin = (await ana.get("/api/admin/clases/" + enc(id))).json;
    const estados = admin.gente.map((g) => g.estado);
    assert.ok(estados.includes("Vencida") && estados.includes("Cancelada") && estados.includes("Cancelada tarde"), estados.join(", "));
    const profeNombre = admin.profe;
    const cuenta = profeNombre === "Laura" ? LAURA : { Ximena: { correo: "ximena@casalotus.test" }, Geral: { correo: "geral@casalotus.test" } }[profeNombre];
    const profe = s.cliente();
    await entrarComo(profe, { ...cuenta, password: "lotus-profe-dev-2026" });
    const suya = (await profe.get("/api/profe/clases/" + enc(id))).json;
    assert.ok(suya.gente.every((g) => !["Vencida", "Cancelada"].includes(g.estado)));
    assert.equal(suya.ocupados, admin.ocupados);
  } finally {
    await s.cerrar();
  }
});

test("validation uses a neutral sample phone; admins see where a booking came from (never the raw click id)", async () => {
  const s = await arrancar();
  try {
    const mala = await s.cliente().post("/api/publico/reservas", reservaWeb("2026-10-03 08:00", { whatsapp: "123" }));
    assert.equal(mala.status, 422);
    assert.match(mala.json.campos["perfil.whatsapp"], /300 123 4567/);
    assert.ok(!mala.texto.includes("312 872 0888"));

    const web = s.cliente();
    const r = await web.post("/api/publico/reservas", {
      ...reservaWeb("2026-10-03 08:00", { whatsapp: "3155550701", ref: "WEB-PLAN-8", clickIds: { gclid: "Cj0KCQ-SECRETO" } }),
      utm: { source: "google", medium: "cpc", campaign: "prueba-octubre" },
    });
    assert.equal(r.status, 201);
    const ana = s.cliente();
    await entrarComo(ana, ADMIN);
    await ana.post("/api/admin/reservas", { clienta: "C-0001", clase: "2026-10-07 18:00" });
    const d = await ana.get("/api/admin/clientas/C-0001");
    const suya = d.json.reservas.find((x) => x.id === r.json.codigo);
    assert.deepEqual(suya.atribucion, { ref: "WEB-PLAN-8", utm: { source: "google", medium: "cpc", campaign: "prueba-octubre" }, clic: "gclid" });
    assert.equal(d.json.reservas.find((x) => x.id !== r.json.codigo).atribucion, null, "a panel booking has none");
    assert.ok(!d.texto.includes("Cj0KCQ-SECRETO"), "the click id value never leaves the server");
    // her own account carries no attribution
    const yo = (await web.get("/api/yo")).json;
    assert.ok(yo.proximas.length && yo.proximas.every((x) => !("atribucion" in x)));
  } finally {
    await s.cerrar();
  }
});
