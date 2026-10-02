// The policy copy a clienta reads before cancelling or rescheduling.
import { describe, test, expect } from "vitest";
import { politicaCancelarTexto, politicaReagendarTexto } from "../src/lib/politica.js";
import { faltaTexto } from "../src/lib/fechas.js";
import { momentoMs } from "../src/lib/reglas.js";

const clase = { id: "2026-10-03 08:00", fecha: "2026-10-03", hora: "08:00" };
const inicio = momentoMs(clase.fecha, clase.hora);
const H = 3600000;
const reserva = (extra = {}) => ({
  id: "R-0001", estado: "Confirmada", clase, puedeCancelar: true, cancelarSinCosto: true,
  limiteCancelar: new Date(inicio - 6 * H).toISOString(), puedeReagendar: true, limiteReagendar: new Date(inicio - 6 * H).toISOString(), ...extra,
});

describe("cancelling", () => {
  test("with time to spare, the class goes back to her plan", () => {
    const p = politicaCancelarTexto(reserva(), inicio - 20 * H);
    expect(p.puede).toBe(true);
    expect(p.sinCosto).toBe(true);
    expect(p.tono).toBe("ok");
    expect(p.titulo).toBe("Faltan 20 horas: si cancelas, la clase vuelve a tu plan.");
    expect(p.detalle).toBe("Puedes cancelar sin costo hasta mañana a las 2:00 a. m."); // relative to `ahora` (Oct 2, 12:00)
  });

  test("late, it is spent and the swing goes to the waiting list", () => {
    const p = politicaCancelarTexto(reserva({ cancelarSinCosto: false }), inicio - 3 * H);
    expect(p.sinCosto).toBe(false);
    expect(p.tono).toBe("aviso");
    expect(p.titulo).toBe("Faltan 3 horas: si cancelas, se descuenta de tu plan y tu columpio queda libre para alguien en lista de espera.");
  });

  test("the live clock wins over a stale server flag", () => {
    // the sheet was opened with time to spare, but the limit passed while it stayed open
    const p = politicaCancelarTexto(reserva({ cancelarSinCosto: true }), inicio - 5 * H);
    expect(p.sinCosto).toBe(false);
  });

  test("an unpaid hold costs nothing", () => {
    const p = politicaCancelarTexto(reserva({ estado: "Pendiente de pago" }), inicio - 2 * H);
    expect(p.sinCosto).toBe(true);
    expect(p.detalle).toMatch(/no pagas nada/);
  });

  test("after the class starts there is nothing to cancel", () => {
    const p = politicaCancelarTexto(reserva(), inicio + 60000);
    expect(p.puede).toBe(false);
    expect(p.titulo).toMatch(/ya empezó/);
  });
});

describe("rescheduling", () => {
  test("allowed until the limit, with the limit in words", () => {
    const p = politicaReagendarTexto(reserva(), inicio - 60 * H); // Oct 1, 20:00: two days ahead reads as a date
    expect(p.puede).toBe(true);
    expect(p.detalle).toBe("Puedes cambiarla hasta el sábado 3 de octubre a las 2:00 a. m.");
  });
  test("not after the limit", () => {
    const p = politicaReagendarTexto(reserva(), inicio - 2 * H);
    expect(p.puede).toBe(false);
    expect(p.titulo).toBe("Ya no se puede cambiar");
  });
  test("a trial explains its single change", () => {
    const p = politicaReagendarTexto(reserva({ puedeReagendar: false, plan: "Clase de prueba" }), inicio - 30 * H);
    expect(p.puede).toBe(false);
    expect(p.detalle).toMatch(/una sola vez/);
  });
});

describe("faltaTexto", () => {
  test.each([
    [40 * 60000, "Faltan 40 minutos"], [H, "Falta 1 hora"], [20 * H, "Faltan 20 horas"], [50 * H, "Faltan 2 días"],
  ])("%i ms → %s", (ms, texto) => expect(faltaTexto(ms, 0)).toBe(texto));
});
