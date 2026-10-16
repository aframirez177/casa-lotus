// Class reminders on the app side: the «No puedo ir» link's scoped session (demo adapter, same rules as the
// server: CONTRATO §10), the reminders switch, and the calm header of that view.
import { describe, test, expect, beforeEach } from "vitest";
import { crearServidorDemo } from "../src/api/mock/servidor.js";
import { ESTADO, hoyClave, momentoMs, inicioClase, ACTIVAS } from "../src/lib/reglas.js";
import { tituloTuClase } from "../src/lib/clases.js";

let t, s;
const get = (url) => s.manejar("GET", url);
const post = (url, b) => s.manejar("POST", url, b);
const patch = (url, b) => s.manejar("PATCH", url, b);

beforeEach(() => {
  t = momentoMs(hoyClave(), "10:00");
  s = crearServidorDemo({ ahora: () => t, persistir: false, latencia: [0, 0] });
});

/** A clienta with at least two upcoming bookings (so the scope is visible). */
function conDosClases() {
  const porClienta = new Map();
  for (const r of s.db.reservas) {
    const c = s.db.clases.find((k) => k.id === r.clase);
    if (!ACTIVAS.includes(r.estado) || inicioClase(c) < t + 30 * 3600000) continue;
    porClienta.set(r.clienta, [...(porClienta.get(r.clienta) || []), r]);
  }
  const [id, reservas] = [...porClienta.entries()].find(([, l]) => l.length >= 2);
  return { id, reservas: reservas.sort((a, b) => (a.clase < b.clase ? -1 : 1)) };
}

describe("«No puedo ir» (reminder link)", () => {
  test("opens a limited session that sees only that booking and lands on its cancel sheet", () => {
    const { reservas } = conDosClases();
    const [una, otra] = reservas;
    const r = get(`/api/auth/reserva/${una.id}`);
    expect(r.cuerpo.redirige).toBe(`/app/mi/clases?reserva=${una.id}&accion=cancelar`);
    const yo = get("/api/yo").cuerpo;
    expect(yo.clienta.limitada).toBe(true);
    expect(yo.proximas.map((x) => x.id)).toEqual([una.id]);
    expect(yo.historial).toEqual([]);
    expect(yo.compras).toEqual([]);
    expect(yo.fijos).toEqual([]);
    expect(post(`/api/yo/reservas/${otra.id}/cancelar`).status).toBe(404);
    expect(post("/api/yo/reservas", { clase: otra.clase }).status).toBe(403);
  });

  test("cancelling there follows the normal policy (on time: back to her plan)", () => {
    const { reservas } = conDosClases();
    const una = reservas.find((x) => x.estado === ESTADO.CONFIRMADA) || reservas[0];
    get(`/api/auth/reserva/${una.id}`);
    t = inicioClase(s.db.clases.find((c) => c.id === una.clase)) - 24 * 3600000;
    const x = post(`/api/yo/reservas/${una.id}/cancelar`);
    expect(x.status).toBe(200);
    expect(x.cuerpo.reserva.estado).toBe(ESTADO.CANCELADA);
  });

  test("moving it keeps the session on the new class", () => {
    const { reservas } = conDosClases();
    const una = reservas[0];
    get(`/api/auth/reserva/${una.id}`);
    const destino = s.db.clases.find((c) => c.estado !== "Cancelada" && inicioClase(c) > t + 30 * 3600000 && c.id !== una.clase
      && s.db.reservas.filter((r) => r.clase === c.id && ["Pendiente de pago", "Confirmada"].includes(r.estado)).length < c.cupos
      && !s.db.reservas.some((r) => r.clase === c.id && r.clienta === una.clienta && ACTIVAS.includes(r.estado)));
    const m = post(`/api/yo/reservas/${una.id}/reagendar`, { clase: destino.id });
    expect(m.status).toBe(200);
    expect(get("/api/yo").cuerpo.proximas.map((x) => x.id)).toEqual([m.cuerpo.nueva.id]);
  });

  test("a dead link (cancelled or started class) sends her to sign in", () => {
    const { reservas } = conDosClases();
    t = inicioClase(s.db.clases.find((c) => c.id === reservas[0].clase)) + 60000;
    expect(get(`/api/auth/reserva/${reservas[0].id}`).cuerpo).toEqual({ redirige: "/app/entrar?enlace=vencido" });
  });
});

describe("reminders switch", () => {
  test("Perfil.recordatorios is the «sin-recordatorios» tag, both ways, and Ana sees it", () => {
    s.entrarComo("clienta");
    expect(get("/api/yo").cuerpo.clienta.perfil.recordatorios).toBe(true);
    expect(s.manejar("PATCH", "/api/yo/perfil", { recordatorios: false }).cuerpo.perfil.recordatorios).toBe(false);
    s.entrarComo("admin");
    expect(get("/api/admin/clientas/C-0001").cuerpo.etiquetas).toContain("sin-recordatorios");
    expect(patch("/api/admin/clientas/C-0001", { recordatorios: true }).cuerpo.etiquetas).not.toContain("sin-recordatorios");
  });
});

describe("words", () => {
  test("«Tu clase del sábado 8:00»", () => {
    expect(tituloTuClase({ fecha: "2026-10-17", hora: "08:00" })).toBe("Tu clase del sábado 8:00");
    expect(tituloTuClase({ fecha: "2026-10-21", hora: "19:00" })).toBe("Tu clase del miércoles 7:00");
    expect(tituloTuClase({ fecha: "2026-10-19", hora: "12:30" })).toBe("Tu clase del lunes 12:30");
    expect(tituloTuClase(null)).toBe("Tu clase");
  });
});
