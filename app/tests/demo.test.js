// The demo adapter follows the same rules as the server: booking, cancel on time vs late, reschedule.
import { describe, test, expect, beforeEach } from "vitest";
import { crearServidorDemo } from "../src/api/mock/servidor.js";
import { ESTADO, inicioClase, sumarDias, hoyClave, momentoMs } from "../src/lib/reglas.js";

const H = 3600000;
let t, s;
const get = (url) => s.manejar("GET", url);
const post = (url, cuerpo) => s.manejar("POST", url, cuerpo);
const futuraLibre = (min = 30) => s.db.clases.find((c) => c.estado !== "Cancelada" && inicioClase(c) > t + min * H && s.db.reservas.filter((r) => r.clase === c.id && ["Pendiente de pago", "Confirmada"].includes(r.estado)).length < c.cupos
  && !s.db.reservas.some((r) => r.clase === c.id && r.clienta === "C-0001" && ["Pendiente de pago", "Confirmada"].includes(r.estado)));

beforeEach(() => {
  t = momentoMs(hoyClave(), "10:00");
  s = crearServidorDemo({ ahora: () => t, persistir: false, latencia: [0, 0] });
});

describe("seeded studio", () => {
  test("every screen has something to show", () => {
    s.entrarComo("admin");
    const tab = get("/api/admin/tablero").cuerpo;
    expect(tab.pendientes.length).toBeGreaterThan(0);
    const tipos = new Set(tab.alertas.map((a) => a.tipo));
    for (const tipo of ["pago-por-vencer", "cupo-liberado", "saldo-bajo", "vence-pronto", "sin-clases", "cumple"]) expect(tipos, tipo).toContain(tipo);
    expect(tab.segmentos.filter((x) => x.total > 0).length).toBeGreaterThanOrEqual(10);
    for (const url of ["/api/admin/agenda", "/api/admin/horario", "/api/admin/clientas", "/api/admin/pagos", "/api/admin/equipo", "/api/admin/ajustes", "/api/admin/registro", "/api/admin/whatsapp/conversaciones", "/api/admin/whatsapp/conversaciones/W-1"]) {
      expect(get(url).status, url).toBe(200);
    }
  });
  test("the public never sees names", () => {
    const d = get("/api/publico/disponibilidad").cuerpo;
    expect(JSON.stringify(d)).not.toMatch(/Valentina|whatsapp|profe/i);
  });
});

describe("booking", () => {
  test("a public booking holds a swing until payment and opens a session", () => {
    const c = futuraLibre();
    const r = post("/api/publico/reservas", {
      clase: c.id, plan: "Clase de prueba", ref: "WEB-HERO", website: "",
      perfil: { nombre: "Persona Inventada", whatsapp: "3015550000", salud: "Ninguna", contactoEmergencia: { nombre: "X", whatsapp: "3105550000" }, experiencia: "Primera vez" },
      consentimientos: { datos: { acepta: true }, descargo: { acepta: true }, imagen: { acepta: false } },
    });
    expect(r.status).toBe(201);
    expect(r.cuerpo.estado).toBe(ESTADO.PENDIENTE);
    expect(r.cuerpo.pago.monto).toBe(25000);
    expect(r.cuerpo.pago.waEnlace).toMatch(/^https:\/\/wa\.me\/57\d+\?text=/);
    expect(Date.parse(r.cuerpo.pago.venceApartado)).toBeLessThanOrEqual(inicioClase(c));
    expect(get("/api/auth/yo").cuerpo.usuario.rol).toBe("clienta");
  });

  test("a known WhatsApp from the public flow gets a limited session that cannot spend her plan", () => {
    const c = futuraLibre();
    post("/api/publico/reservas", {
      clase: c.id, website: "", perfil: { nombre: "Valentina", whatsapp: s.db.clientas[0].whatsapp },
      consentimientos: { datos: { acepta: true }, descargo: { acepta: true }, imagen: { acepta: true } },
    });
    const yo = get("/api/yo").cuerpo;
    expect(yo.clienta.limitada).toBe(true);
    expect(yo.saldo.clases).toBe(0);
    expect(yo.clienta.perfil.salud).toBe("");
    expect(post("/api/yo/reservas", { clase: futuraLibre().id }).status).toBe(403);
  });

  test("a clienta with a plan books confirmed and spends one class", () => {
    s.entrarComo("clienta");
    const antes = get("/api/yo").cuerpo.saldo.clases;
    const c = futuraLibre();
    const r = post("/api/yo/reservas", { clase: c.id });
    expect(r.status).toBe(201);
    expect(r.cuerpo.estado).toBe(ESTADO.CONFIRMADA);
    expect(get("/api/yo").cuerpo.saldo.clases).toBe(antes - 1);
  });

  test("a full class answers 409 llena", () => {
    s.entrarComo("clienta");
    const llena = s.db.clases.find((c) => inicioClase(c) > t + 24 * H && s.db.reservas.filter((r) => r.clase === c.id && ["Pendiente de pago", "Confirmada"].includes(r.estado)).length >= c.cupos);
    const r = post("/api/yo/reservas", { clase: llena.id });
    expect(r.status).toBe(409);
    expect(r.cuerpo.motivo).toBe("llena");
  });

  test("booking closes 3 hours before the class", () => {
    s.entrarComo("clienta");
    const c = futuraLibre();
    t = inicioClase(c) - 2 * H;
    const r = post("/api/yo/reservas", { clase: c.id });
    expect(r.status).toBe(409);
    expect(r.cuerpo.motivo).toBe("tarde");
  });
});

describe("cancelling", () => {
  const reservar = () => { s.entrarComo("clienta"); const c = futuraLibre(30); return { c, r: post("/api/yo/reservas", { clase: c.id }).cuerpo }; };

  test("on time: «Cancelada» and the class goes back to the plan", () => {
    const { c, r } = reservar();
    const saldo = get("/api/yo").cuerpo.saldo.clases;
    t = inicioClase(c) - 20 * H;
    const x = post(`/api/yo/reservas/${r.id}/cancelar`).cuerpo;
    expect(x.reserva.estado).toBe(ESTADO.CANCELADA);
    expect(x.devolvioClase).toBe(true);
    expect(get("/api/yo").cuerpo.saldo.clases).toBe(saldo + 1);
  });

  test("late: «Cancelada tarde», the swing is freed but the class is spent", () => {
    const { c, r } = reservar();
    const saldo = get("/api/yo").cuerpo.saldo.clases;
    const ocupadosAntes = get("/api/publico/disponibilidad?dias=40").cuerpo.clases.find((k) => k.id === c.id).ocupados;
    t = inicioClase(c) - 3 * H;
    const x = post(`/api/yo/reservas/${r.id}/cancelar`).cuerpo;
    expect(x.reserva.estado).toBe(ESTADO.CANCELADA_TARDE);
    expect(x.devolvioClase).toBe(false);
    expect(x.mensaje).toMatch(/se descontó de tu plan/);
    expect(get("/api/yo").cuerpo.saldo.clases).toBe(saldo);
    t = inicioClase(c) - 4 * H; // still bookable: the swing is free for someone else
    expect(get("/api/publico/disponibilidad?dias=40").cuerpo.clases.find((k) => k.id === c.id).ocupados).toBe(ocupadosAntes - 1);
  });

  test("the booking card says which rule applies", () => {
    const { c, r } = reservar();
    t = inicioClase(c) - 20 * H;
    expect(get("/api/yo").cuerpo.proximas.find((x) => x.id === r.id).cancelarSinCosto).toBe(true);
    t = inicioClase(c) - 3 * H;
    expect(get("/api/yo").cuerpo.proximas.find((x) => x.id === r.id).cancelarSinCosto).toBe(false);
  });
});

describe("rescheduling", () => {
  test("moves the booking atomically and keeps it confirmed", () => {
    s.entrarComo("clienta");
    const a = futuraLibre(30);
    const r = post("/api/yo/reservas", { clase: a.id }).cuerpo;
    const b = s.db.clases.find((c) => c.id !== a.id && inicioClase(c) > t + 30 * H && s.db.reservas.filter((x) => x.clase === c.id && ["Pendiente de pago", "Confirmada"].includes(x.estado)).length < c.cupos && !s.db.reservas.some((x) => x.clase === c.id && x.clienta === "C-0001" && ["Confirmada", "Pendiente de pago"].includes(x.estado)));
    const x = post(`/api/yo/reservas/${r.id}/reagendar`, { clase: b.id });
    expect(x.status).toBe(200);
    expect(x.cuerpo.anterior.estado).toBe(ESTADO.CANCELADA);
    expect(x.cuerpo.nueva.estado).toBe(ESTADO.CONFIRMADA);
    expect(x.cuerpo.nueva.clase.id).toBe(b.id);
    expect(x.cuerpo.nueva.reagendadaDe).toBe(r.id);
  });

  test("not within the cancel window", () => {
    s.entrarComo("clienta");
    const a = futuraLibre(30);
    const r = post("/api/yo/reservas", { clase: a.id }).cuerpo;
    t = inicioClase(a) - 2 * H;
    const x = post(`/api/yo/reservas/${r.id}/reagendar`, { clase: futuraLibre(30).id });
    expect(x.status).toBe(409);
    expect(x.cuerpo.motivo).toBe("tarde");
  });

  test("a trial changes only once", () => {
    const c1 = futuraLibre(48);
    post("/api/publico/reservas", { clase: c1.id, plan: "Clase de prueba", website: "", perfil: { nombre: "Nueva Persona", whatsapp: "3015557777" }, consentimientos: { datos: { acepta: true }, descargo: { acepta: true }, imagen: { acepta: true } } });
    const r = get("/api/yo").cuerpo.proximas[0];
    const otras = s.db.clases.filter((c) => c.id !== c1.id && inicioClase(c) > t + 48 * H && s.db.reservas.filter((x) => x.clase === c.id && ["Pendiente de pago", "Confirmada"].includes(x.estado)).length < c.cupos);
    const primera = post(`/api/yo/reservas/${r.id}/reagendar`, { clase: otras[0].id });
    expect(primera.status).toBe(200);
    const segunda = post(`/api/yo/reservas/${primera.cuerpo.nueva.id}/reagendar`, { clase: otras[1].id });
    expect(segunda.status).toBe(409);
    expect(segunda.cuerpo.motivo).toBe("cambios");
  });
});

describe("staff", () => {
  test("attendance can be marked from one hour before, by the class's profe", () => {
    s.entrarComo("profe");
    const mias = get("/api/profe/clases").cuerpo;
    const c = mias.find((k) => k.gente.some((g) => g.estado === "Confirmada"));
    const g = c.gente.find((x) => x.estado === "Confirmada");
    t = inicioClase(c) + 30 * 60000;
    const r = post(`/api/profe/reservas/${g.reserva}/asistencia`, { vino: true });
    expect(r.status).toBe(200);
    expect(r.cuerpo.gente.find((x) => x.reserva === g.reserva).estado).toBe(ESTADO.ASISTIO);
  });
  test("a profe cannot open another profe's class", () => {
    s.entrarComo("profe");
    const ajena = s.db.clases.find((c) => c.profe !== "Salomé" && c.fecha >= sumarDias(hoyClave(t), 0));
    expect(get(`/api/profe/clases/${encodeURIComponent(ajena.id)}`).status).toBe(403);
  });
});
