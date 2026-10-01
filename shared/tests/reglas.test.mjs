// Run: node --test shared/tests
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../reglas.js";

test("Colombian holidays 2026 (Ley Emiliani)", () => {
  assert.deepEqual(R.festivosColombia(2026).map((x) => x.fecha), ["2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01",
    "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25"]);
});

test("dates are time-zone independent", () => {
  assert.equal(R.diaDeSemana("2026-10-03"), "Sábado");
  assert.equal(R.fechaLegible("2026-10-03"), "sábado 3 de octubre");
  assert.equal(R.sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(R.momentoMs("2026-10-03", "08:00"), Date.parse("2026-10-03T08:00:00-05:00"));
  assert.equal(R.hoyClave(Date.parse("2026-10-03T23:30:00-05:00")), "2026-10-03");
  assert.equal(R.horaLegible("18:00"), "6:00 p. m.");
  assert.equal(R.dinero(1111000), "$1.111.000");
});

test("calendar skips holidays", () => {
  const h = [{ dia: "Lunes", hora: "18:00", clase: "Yoga Aéreo", profe: "Ximena", cupos: 8, activa: true }];
  const f = R.fechasDeClase(h, "2026-10-05", 2).map((c) => c.fecha);
  assert.deepEqual(f, ["2026-10-05"]); // 12 Oct is Día de la Raza
});

test("balances: cancelled late spends the class, frees the swing", () => {
  const compras = [{ id: "P-0001", clienta: "C-0001", inicio: "2026-10-01", vence: "2026-10-30", clases: 4 }];
  const reservas = [
    { id: "R-1", clase: "2026-10-03 08:00", clienta: "C-0001", compra: "P-0001", estado: R.ESTADO.ASISTIO },
    { id: "R-2", clase: "2026-10-07 18:00", clienta: "C-0001", compra: "P-0001", estado: R.ESTADO.CANCELADA_TARDE },
    { id: "R-3", clase: "2026-10-10 08:00", clienta: "C-0001", compra: "P-0001", estado: R.ESTADO.CANCELADA },
  ];
  assert.deepEqual(R.saldo(compras, reservas, "C-0001", "2026-10-05"), { clases: 2, vence: "2026-10-30" });
  assert.equal(R.ocupados(reservas, "2026-10-07 18:00"), 0);
});

test("cancel and reschedule policy", () => {
  const clase = { fecha: "2026-10-03", hora: "08:00" };
  const confirmada = { estado: R.ESTADO.CONFIRMADA };
  const antes = Date.parse("2026-10-02T20:00:00-05:00"), tarde = Date.parse("2026-10-03T05:00:00-05:00");
  assert.deepEqual(R.politicaCancelar(confirmada, clase, antes, 6).estado, R.ESTADO.CANCELADA);
  assert.equal(R.politicaCancelar(confirmada, clase, tarde, 6).estado, R.ESTADO.CANCELADA_TARDE);
  assert.equal(R.politicaCancelar({ estado: R.ESTADO.PENDIENTE }, clase, tarde, 6).devuelveClase, false);
  assert.equal(R.politicaReagendar(confirmada, clase, tarde, 6).ok, false);
  assert.equal(R.politicaReagendar(confirmada, clase, antes, 6, 1, 1).motivo, "cambios");
  assert.equal(R.politicaReagendar(confirmada, clase, antes, 6, 0, 1).ok, true);
});

test("birthdays", () => {
  assert.equal(R.diasParaCumple("1990-10-05", "2026-10-01"), 4);
  assert.equal(R.diasParaCumple("1990-01-02", "2026-12-31"), 2);
  assert.equal(R.diasParaCumple("", "2026-12-31"), null);
});
