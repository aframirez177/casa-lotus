// Cupos fijos in the demo adapter (same shapes as the server, CONTRATO §10) and the words the screens use.
import { describe, test, expect, beforeEach } from "vitest";
import { crearServidorDemo } from "../src/api/mock/servidor.js";
import { ESTADO, hoyClave, momentoMs, sumarDias, inicioClase } from "../src/lib/reglas.js";
import { slotTexto, textoFijas, textoConflicto, resumenAlta, hastaDePausa, estadoFijoTexto, origenTexto, listaDias, textoDevueltas } from "../src/lib/fijos.js";

let t, s, n = 0;
const get = (url) => s.manejar("GET", url);
const post = (url, b) => s.manejar("POST", url, b);
const patch = (url, b) => s.manejar("PATCH", url, b);
const del = (url) => s.manejar("DELETE", url);

beforeEach(() => {
  t = momentoMs(hoyClave(), "10:00");
  s = crearServidorDemo({ ahora: () => t, persistir: false, latencia: [0, 0] });
  s.entrarComo("admin");
});

/** A fresh person (optionally with a plan) and a fresh Sunday slot nobody uses, so counts are exact. */
function persona(plan = "8 clases al mes") {
  n++;
  const c = post("/api/admin/clientas", { nombre: `Prueba Fija ${n}`, whatsapp: "30155" + String(10000 + n).slice(-5), consentimientos: { datos: { acepta: true } } }).cuerpo;
  if (plan) expect(post("/api/admin/pagos", { clienta: c.id, plan, medio: "Nequi" }).status).toBe(201);
  return c;
}
function franja(cupos = 8, hora = "06:05") {
  const r = post("/api/admin/horario", { dia: "Domingo", hora, clase: "Yoga Aéreo", profe: "Renata", cupos });
  expect(r.status).toBe(201);
  return r.cuerpo.slot;
}
/** The slot's classes the fijo should book: from today to +14 days, not started. */
const ventana = (slot) => s.db.clases.filter((c) => c.dia === slot.dia && c.hora === slot.hora && c.fecha <= sumarDias(hoyClave(t), 14) && inicioClase(c) > t && c.estado !== "Cancelada");
const fijar = (clienta, slot, extra = {}) => post("/api/admin/fijos", { clienta: clienta.id, dia: slot.dia, hora: slot.hora, ...extra });
const detalle = (c) => get(`/api/admin/clientas/${c.id}`).cuerpo;

describe("adding a regular", () => {
  test("books every class of the next 14 days, confirmed with her plan", () => {
    const c = persona(), slot = franja();
    const antes = detalle(c).saldo.clases;
    const r = fijar(c, slot);
    expect(r.status).toBe(201);
    const esperadas = ventana(slot).map((k) => k.id);
    expect(esperadas.length).toBeGreaterThan(0);
    expect(r.cuerpo.reservasCreadas.map((x) => x.clase.id)).toEqual(esperadas);
    expect(r.cuerpo.reservasCreadas.every((x) => x.estado === ESTADO.CONFIRMADA)).toBe(true);
    expect(r.cuerpo.conflictos).toEqual([]);
    expect(r.cuerpo.fijo).toMatchObject({ clienta: { id: c.id }, dia: "Domingo", hora: "06:05", slot: "Domingo 06:05", slotTexto: "domingos 6:05 a. m.", estado: "Activo", hasta: "" });
    expect(r.cuerpo.fijo.proximas.map((p) => p.clase.id)).toEqual(esperadas);
    const d = detalle(c);
    expect(d.saldo.clases).toBe(antes - esperadas.length);
    expect(d.fijos.map((f) => f.id)).toEqual([r.cuerpo.fijo.id]);
    expect(d.reservas.filter((x) => x.fijo === r.cuerpo.fijo.id).length).toBe(esperadas.length);
    expect(d.segmentos).toContain("con-cupo-fijo");
  });

  test("the roster and the agenda mark her bookings «Fija»; Origen carries the fijo id", () => {
    const c = persona(), slot = franja();
    const { fijo } = fijar(c, slot).cuerpo;
    const clase = get(`/api/admin/clases/${encodeURIComponent(ventana(slot)[0].id)}`).cuerpo;
    const yo = clase.gente.find((g) => g.clienta === c.id);
    expect(yo.fijo).toBe(fijo.id);
    expect(yo.origen).toBe("Cupo fijo · " + fijo.id);
    expect(origenTexto(yo.origen)).toBe("Cupo fijo");
  });

  test("validation: a slot that is not in Horario, an unknown person, the same slot twice", () => {
    const c = persona(), slot = franja();
    expect(post("/api/admin/fijos", { clienta: c.id, dia: "Martes", hora: "05:00" })).toMatchObject({ status: 422, cuerpo: { campos: { hora: expect.any(String) } } });
    expect(post("/api/admin/fijos", { clienta: "C-9999", dia: slot.dia, hora: slot.hora }).status).toBe(404);
    expect(fijar(c, slot).status).toBe(201);
    expect(fijar(c, slot)).toMatchObject({ status: 409, cuerpo: { motivo: "ya-reservada" } });
    expect(fijar(c, slot, { desde: sumarDias(hoyClave(t), 10), hasta: sumarDias(hoyClave(t), 3) }).status).toBe(422);
  });

  test("«desde» in the future: nothing before it is booked", () => {
    const c = persona(), slot = franja();
    const [primera, ...resto] = ventana(slot);
    const r = fijar(c, slot, { desde: sumarDias(primera.fecha, 1) }).cuerpo;
    expect(r.reservasCreadas.map((x) => x.clase.id)).toEqual(resto.map((k) => k.id));
  });
});

describe("without a plan", () => {
  test("her swing is held unpaid and never expires; Ana gets «fijo-sin-plan»; a payment confirms them", () => {
    const c = persona(null), slot = franja();
    const r = fijar(c, slot).cuerpo;
    expect(r.reservasCreadas.length).toBeGreaterThan(0);
    expect(r.reservasCreadas.every((x) => x.estado === ESTADO.PENDIENTE)).toBe(true);
    const d = detalle(c);
    const suyas = d.reservas.filter((x) => x.fijo === r.fijo.id);
    expect(suyas.every((x) => x.pago && x.pago.venceApartado === null)).toBe(true);
    expect(s.db.reservas.filter((x) => x.clienta === c.id).every((x) => x.notas === "Cupo fijo · sin plan")).toBe(true);
    const tab = get("/api/admin/tablero").cuerpo;
    expect(tab.pendientes.filter((p) => p.clienta === c.id).every((p) => p.venceApartado === null)).toBe(true);
    const alerta = tab.alertas.find((a) => a.id === "fijo-sin-plan:" + r.fijo.id);
    expect(alerta).toMatchObject({ tipo: "fijo-sin-plan", clienta: { id: c.id }, accion: { tipo: "whatsapp" } });
    expect([1, 2]).toContain(alerta.prioridad);
    // the hold survives the clock (no expiry for a fijo)
    t += 30 * 3600000;
    expect(detalle(c).reservas.filter((x) => x.fijo === r.fijo.id && x.estado === ESTADO.PENDIENTE).length).toBeGreaterThan(0);
    // «Registrar pago» from the alert: her held classes take the new plan
    const pago = post("/api/admin/pagos", { clienta: c.id, plan: "8 clases al mes", medio: "Nequi" });
    expect(pago.status).toBe(201);
    expect(pago.cuerpo.reservasConfirmadas.length).toBeGreaterThan(0);
    expect(pago.cuerpo.reservasConfirmadas.every((x) => x.estado === ESTADO.CONFIRMADA && x.fijo === r.fijo.id)).toBe(true);
    expect(detalle(c).reservas.filter((x) => x.fijo === r.fijo.id && x.clase.fecha >= hoyClave(t)).every((x) => x.estado === ESTADO.CONFIRMADA)).toBe(true);
    expect(get("/api/admin/tablero").cuerpo.alertas.some((a) => a.id === "fijo-sin-plan:" + r.fijo.id)).toBe(false);
  });

  test("prioridad 1 when her unpaid class is within 48 hours", () => {
    const c = persona(null), slot = franja();
    const r = fijar(c, slot).cuerpo;
    t = inicioClase(r.reservasCreadas[0].clase) - 20 * 3600000;
    expect(get("/api/admin/tablero").cuerpo.alertas.find((a) => a.id === "fijo-sin-plan:" + r.fijo.id).prioridad).toBe(1);
  });
});

describe("a full class", () => {
  test("is a conflict, not a booking, and Ana hears «fijo-sin-columpio»", () => {
    const slot = franja(1, "06:10");
    const primera = ventana(slot)[0];
    expect(post("/api/admin/reservas", { clienta: persona().id, clase: primera.id }).status).toBe(201);
    const c = persona();
    const r = fijar(c, slot).cuerpo;
    expect(r.conflictos).toEqual([expect.objectContaining({ motivo: "llena", clase: expect.objectContaining({ id: primera.id }) })]);
    expect(r.reservasCreadas.map((x) => x.clase.id)).not.toContain(primera.id);
    expect(textoConflicto(r.conflictos[0])).toMatch(/^El domingo \d+ está lleno: no se pudo reservar$/);
    const alerta = get("/api/admin/tablero").cuerpo.alertas.find((a) => a.tipo === "fijo-sin-columpio" && a.clienta?.id === c.id);
    expect(alerta).toMatchObject({ id: `fijo-sin-columpio:${r.fijo.id}:${primera.id}`, prioridad: 1, accion: { tipo: "abrir", ruta: "/app/admin/agenda/" + encodeURIComponent(primera.id) } });
  });
});

describe("her own dates", () => {
  test("a date she cancels is never booked again by the fijo", () => {
    const c = persona(), slot = franja();
    const r = fijar(c, slot).cuerpo;
    const una = r.reservasCreadas[0];
    expect(post(`/api/admin/reservas/${una.id}/cancelar`, {}).status).toBe(200);
    get("/api/admin/tablero"); // every request runs the weekly generation
    const enEsa = s.db.reservas.filter((x) => x.clienta === c.id && x.clase === una.clase.id);
    expect(enEsa.map((x) => x.estado)).toEqual([ESTADO.CANCELADA]);
  });

  test("the window rolls: a week later, the next class is booked on its own", () => {
    const c = persona(), slot = franja();
    const r = fijar(c, slot).cuerpo;
    t += 7 * 86400000;
    const ahora = get(`/api/admin/fijos?clienta=${c.id}`).cuerpo[0];
    expect(ahora.proximas.length).toBeGreaterThanOrEqual(r.reservasCreadas.length - 1);
    expect(ahora.proximas.at(-1).clase.fecha > r.reservasCreadas.at(-1).clase.fecha).toBe(true);
  });
});

describe("pause, resume and end", () => {
  test("pause with «cancelar sus clases»: they go back to her plan; resume books them again", () => {
    const c = persona(), slot = franja();
    const r = fijar(c, slot).cuerpo;
    const conPlan = detalle(c).saldo.clases;
    const p = patch(`/api/admin/fijos/${r.fijo.id}`, { estado: "Pausado", cancelarFuturas: true });
    expect(p.status).toBe(200);
    expect(p.cuerpo).toMatchObject({ fijo: { estado: "Pausado", proximas: [] }, reservasCreadas: [], conflictos: [] });
    expect(p.cuerpo.reservasCanceladas.map((x) => x.id)).toEqual(r.reservasCreadas.map((x) => x.id));
    expect(p.cuerpo.reservasCanceladas.every((x) => x.estado === ESTADO.CANCELADA && x.fijo === r.fijo.id)).toBe(true);
    expect(detalle(c).saldo.clases).toBe(conPlan + r.reservasCreadas.length);
    expect(s.db.reservas.filter((x) => x.clienta === c.id && x.estado === ESTADO.CANCELADA).every((x) => x.notas === "Cupo fijo pausado")).toBe(true);
    // paused: the generation leaves her alone
    t += 7 * 86400000;
    expect(get(`/api/admin/fijos?clienta=${c.id}`).cuerpo[0].proximas).toEqual([]);
    const a = patch(`/api/admin/fijos/${r.fijo.id}`, { estado: "Activo", hasta: "" });
    expect(a.cuerpo.fijo.estado).toBe("Activo");
    expect(a.cuerpo.reservasCreadas.length).toBe(ventana(slot).length);
  });

  test("pause from a later date keeps the classes before it", () => {
    const c = persona(), slot = franja();
    const r = fijar(c, slot).cuerpo;
    const [primera, segunda] = r.reservasCreadas;
    if (!segunda) return; // a holiday week can leave a single class in the window
    const hasta = hastaDePausa(segunda.clase.fecha, hoyClave(t));
    expect(hasta).toBe(sumarDias(segunda.clase.fecha, -1));
    const p = patch(`/api/admin/fijos/${r.fijo.id}`, { estado: "Pausado", hasta, cancelarFuturas: true }).cuerpo;
    expect(p.reservasCanceladas.length).toBe(r.reservasCreadas.length - 1);
    expect(p.fijo.proximas.map((x) => x.clase.id)).toEqual([primera.clase.id]);
    expect(estadoFijoTexto(p.fijo, hoyClave(t))).toBe(`Pausado desde el ${segunda.clase.fechaTexto}`);
  });

  test("pause without cancelling keeps what is booked", () => {
    const c = persona(), slot = franja();
    const r = fijar(c, slot).cuerpo;
    const p = patch(`/api/admin/fijos/${r.fijo.id}`, { estado: "Pausado", cancelarFuturas: false }).cuerpo;
    expect(p.reservasCanceladas).toEqual([]);
    expect(p.fijo.proximas.length).toBe(r.reservasCreadas.length);
  });

  test("end (DELETE): Terminado, her future fijo classes cancelled, and it cannot come back", () => {
    const c = persona(), slot = franja();
    const r = fijar(c, slot).cuerpo;
    const d = del(`/api/admin/fijos/${r.fijo.id}`);
    expect(d.status).toBe(200);
    expect(d.cuerpo.fijo.estado).toBe("Terminado");
    expect(d.cuerpo.reservasCanceladas.length).toBe(r.reservasCreadas.length);
    expect(patch(`/api/admin/fijos/${r.fijo.id}`, { estado: "Activo" })).toMatchObject({ status: 409, cuerpo: { motivo: "estado" } });
    expect(detalle(c).segmentos).not.toContain("con-cupo-fijo");
    // a new one on the same slot is fine
    expect(fijar(c, slot).status).toBe(201);
  });
});

describe("where Ana and she see it", () => {
  test("Horario lists the slot's regulars (Activo and Pausado) and counts the active ones", () => {
    const slot = franja();
    const a = persona(), b = persona(), x = persona();
    fijar(a, slot); const fb = fijar(b, slot).cuerpo.fijo; const fx = fijar(x, slot).cuerpo.fijo;
    patch(`/api/admin/fijos/${fb.id}`, { estado: "Pausado" });
    del(`/api/admin/fijos/${fx.id}`);
    const s2 = get("/api/admin/horario").cuerpo.find((h) => h.id === slot.id);
    expect(s2.cuposFijos).toBe(1);
    expect(s2.fijos.map((f) => [f.clienta.id, f.estado])).toEqual(expect.arrayContaining([[a.id, "Activo"], [b.id, "Pausado"]]));
    expect(s2.fijos.length).toBe(2);
    expect(get(`/api/admin/fijos?slot=${encodeURIComponent(slot.id)}`).cuerpo.length).toBe(3);
  });

  test("the segment «Con horario fijo» and the KPI agree with the fijos", () => {
    const tab = get("/api/admin/tablero").cuerpo;
    expect(tab.kpis.fijosActivos).toBe(s.db.fijos.filter((f) => f.estado === "Activo").length);
    const seg = get("/api/admin/segmentos").cuerpo.find((x) => x.id === "con-cupo-fijo");
    expect(seg).toMatchObject({ nombre: "Con horario fijo" });
    expect(get("/api/admin/clientas?segmento=con-cupo-fijo").cuerpo.length).toBe(seg.total);
  });

  test("the seeded studio shows both fijo alerts and a paused regular", () => {
    const tipos = get("/api/admin/tablero").cuerpo.alertas.map((a) => a.tipo);
    expect(tipos).toContain("fijo-sin-plan");
    expect(tipos).toContain("fijo-sin-columpio");
    expect(s.db.fijos.some((f) => f.estado === "Pausado")).toBe(true);
  });

  test("she sees her slot on /api/yo and her generated bookings carry the fijo", () => {
    s.entrarComo("clienta");
    const yo = get("/api/yo").cuerpo;
    expect(yo.fijos).toEqual([expect.objectContaining({ id: expect.stringMatching(/^F-\d{4}$/), slotTexto: "sábados 8:00 a. m.", estado: "Activo" })]);
    const f = yo.fijos[0].id;
    expect(yo.proximas.some((r) => r.fijo === f)).toBe(true);
    expect(yo.proximas.filter((r) => r.fijo !== f).every((r) => r.fijo === null)).toBe(true);
  });

  test("a fijo booking she cancels follows the normal policy (on time: back to her plan)", () => {
    s.entrarComo("clienta");
    const yo = get("/api/yo").cuerpo;
    const r = yo.proximas.find((x) => x.fijo);
    t = inicioClase(r.clase) - 24 * 3600000;
    const x = post(`/api/yo/reservas/${r.id}/cancelar`).cuerpo;
    expect(x).toMatchObject({ devolvioClase: true, reserva: { estado: ESTADO.CANCELADA, fijo: r.fijo } });
  });
});

describe("words", () => {
  test("slot, count, conflict, list of days", () => {
    expect(slotTexto("Sábado", "08:00")).toBe("sábados 8:00 a. m.");
    expect(slotTexto("Miércoles", "19:00")).toBe("miércoles 7:00 p. m.");
    expect(textoFijas(4, 8)).toBe("4 fijas de 8");
    expect(textoFijas(1, 8)).toBe("1 fija de 8");
    expect(textoFijas(0, 8)).toBe("Sin fijas");
    expect(textoConflicto({ clase: { fecha: "2026-10-24" }, motivo: "llena" })).toBe("El sábado 24 está lleno: no se pudo reservar");
    expect(listaDias(["2026-10-17", "2026-10-24", "2026-10-31"])).toBe("sábado 17, sábado 24 y sábado 31");
    expect(listaDias(["2026-10-17"])).toBe("sábado 17");
  });

  test("what adding did", () => {
    const fijo = { slotTexto: "sábados 8:00 a. m." };
    const clase = (fecha) => ({ fecha });
    expect(resumenAlta("Camila Peñaranda", { fijo, reservasCreadas: [{ estado: "Confirmada", clase: clase("2026-10-17") }, { estado: "Confirmada", clase: clase("2026-10-24") }], conflictos: [] }))
      .toEqual({ titulo: "Camila queda fija los sábados 8:00 a. m.", lineas: ["Reservamos sábado 17 y sábado 24."], conflictos: [] });
    const sinPlan = resumenAlta("Sofía", { fijo, reservasCreadas: [{ estado: "Pendiente de pago", clase: clase("2026-10-24") }], conflictos: [{ clase: clase("2026-10-17"), motivo: "llena" }] });
    expect(sinPlan.lineas).toEqual(["Reservamos sábado 24.", "No tiene plan: quedaron apartadas esperando su pago."]);
    expect(sinPlan.conflictos).toEqual(["El sábado 17 está lleno: no se pudo reservar"]);
    expect(resumenAlta("Ana", { fijo, reservasCreadas: [], conflictos: [] }).lineas[0]).toMatch(/se reserva sola/);
  });

  test("pause dates and states", () => {
    expect(hastaDePausa("2026-10-24", "2026-10-15")).toBe("2026-10-23");
    expect(hastaDePausa("2026-10-15", "2026-10-15")).toBe("");
    expect(estadoFijoTexto({ estado: "Pausado", hasta: "" }, "2026-10-15")).toBe("Pausado");
    expect(estadoFijoTexto({ estado: "Pausado", hasta: "2026-10-23" }, "2026-10-15")).toBe("Pausado desde el sábado 24 de octubre");
    expect(estadoFijoTexto({ estado: "Terminado", hasta: "2026-10-15" }, "2026-10-15")).toBe("Terminó el 15 de octubre");
    expect(origenTexto("Web · WEB-HERO")).toBe("Web · WEB-HERO");
    expect(textoDevueltas([{}, {}])).toBe("2 clases volvieron a su plan.");
    expect(textoDevueltas(1)).toBe("1 clase volvió a su plan.");
    expect(textoDevueltas([])).toBe("");
  });
});
